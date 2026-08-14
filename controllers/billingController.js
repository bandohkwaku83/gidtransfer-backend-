import crypto from "crypto"
import User from "../models/User.js"
import BillingEvent from "../models/BillingEvent.js"
import {
    PaystackError,
    disablePaystackSubscription,
    fetchPaystackPlan,
    fetchPaystackSubscription,
    initializePaystackTransaction,
    paystackConfigured,
    paystackPublicKey,
    verifyPaystackTransaction,
} from "../services/paystack.js"
import {
    getPlanById,
    getPlanByPaystackCode,
    normalizePlanId,
    planAmountPesewas,
} from "../utils/planCatalog.js"
import {
    applySubscriptionFromPaystack,
    formatBillingPlansPayload,
    formatBillingSubscriptionResponse,
    getPlanSummaryForUser,
    isPaidSubscriptionActive,
    resetSubscriptionToFree,
} from "../utils/subscriptionFields.js"
import { queueNotifyPlanUpgraded } from "../utils/photographerBillingNotify.js"

const handleBillingError = (res, error) => {
    if (error instanceof PaystackError) {
        const status =
            error.code === "NOT_CONFIGURED"
                ? 503
                : error.status && error.status >= 400 && error.status < 600
                  ? error.status
                  : 502
        return res.status(status).json({
            message: error.message,
            code: error.code,
        })
    }

    if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({ message: error.message })
    }

    console.error("Billing error:", error)
    return res.status(500).json({ message: "Server error" })
}

const billingCallbackUrl = () => {
    const explicit = process.env.PAYSTACK_CALLBACK_URL?.trim()
    if (explicit) return explicit

    const appUrl = process.env.APP_URL?.trim()?.replace(/\/$/, "")
    if (appUrl) return `${appUrl}/billing/callback`

    return undefined
}

/**
 * Paystack charges the amount stored on the plan object, not the amount we pass
 * to transaction/initialize. Refuse checkout when the remote plan is stale.
 */
const assertPaystackPlanAmountMatches = async (plan) => {
    const remote = await fetchPaystackPlan(plan.paystackPlanCode)
    const expected = planAmountPesewas(plan)
    const remoteAmount = Number(remote?.amount)
    if (!Number.isFinite(remoteAmount) || remoteAmount !== expected) {
        const remoteGhs = Number.isFinite(remoteAmount)
            ? remoteAmount / 100
            : null
        const err = new Error(
            `Paystack plan ${plan.paystackPlanCode} is GHS ${remoteGhs ?? "?"} but the app expects GHS ${plan.priceGhs}. Run node scripts/createPaystackPlans.js and update PAYSTACK_PLAN_* in .env.`
        )
        err.statusCode = 503
        err.code = "PAYSTACK_PLAN_AMOUNT_MISMATCH"
        throw err
    }
    return remote
}

const parsePaystackDate = (value) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
}

const loadUserWithSubscriptionSecrets = async (userId) =>
    User.findById(userId).select("+subscription.paystackEmailToken")

const disableExistingSubscription = async (user) => {
    const sub = user.subscription ?? {}
    const code = sub.paystackSubscriptionCode?.trim()
    const token = sub.paystackEmailToken?.trim()

    if (!code || !token) return

    try {
        await disablePaystackSubscription({ code, token })
    } catch (error) {
        console.warn(
            `[billing] Could not disable subscription ${code}:`,
            error.message
        )
    }
}

const activateUserSubscription = async ({
    userId,
    planId,
    subscriptionCode,
    emailToken,
    paystackPlanCode,
    customerCode,
    status = "active",
    currentPeriodEnd = null,
    cancelAtPeriodEnd = false,
    previousSubscriptionCode = "",
}) => {
    const user = await loadUserWithSubscriptionSecrets(userId)
    if (!user) return null

    if (
        previousSubscriptionCode &&
        previousSubscriptionCode !== subscriptionCode
    ) {
        await disableExistingSubscription(user)
    }

    const { planChanged, nextPlanId } = applySubscriptionFromPaystack({
        user,
        planId,
        subscriptionCode,
        emailToken,
        paystackPlanCode,
        customerCode,
        status,
        currentPeriodEnd,
        cancelAtPeriodEnd,
    })

    await user.save()

    if (planChanged && nextPlanId && nextPlanId !== "free") {
        queueNotifyPlanUpgraded(user)
    }

    return user
}

const resolveUserIdFromMetadata = (metadata = {}) => {
    const userId = metadata.userId ?? metadata.user_id
    return userId ? String(userId) : ""
}

const resolvePlanIdFromMetadata = (metadata = {}) => {
    const planId = metadata.planId ?? metadata.plan_id
    return planId ? String(planId).trim().toLowerCase() : ""
}

export const categorizeBillingEventType = (eventType) => {
    const type = String(eventType ?? "").trim().toLowerCase()
    if (
        type === "charge.success" ||
        type === "subscription.create" ||
        type === "invoice.update" ||
        type === "invoice.create"
    ) {
        return "paid"
    }
    if (
        type === "invoice.payment_failed" ||
        type === "charge.failed" ||
        type === "subscription.not_renew"
    ) {
        return "failed"
    }
    if (type.includes("dispute") || type === "charge.dispute.create") {
        return "dispute"
    }
    return "other"
}

const markBillingEventProcessed = async ({
    eventId,
    eventType,
    reference,
    userId = null,
    amount = null,
    currency = "",
    status = "",
}) => {
    try {
        await BillingEvent.create({
            eventId,
            eventType,
            category: categorizeBillingEventType(eventType),
            reference: reference || "",
            user: userId || null,
            amount,
            currency: currency || "",
            status: status || "",
        })
        return true
    } catch (error) {
        if (error.code === 11000) return false
        throw error
    }
}

const syncSubscriptionFromPaystackPayload = async ({
    subscriptionPayload,
    metadata = {},
}) => {
    const subscriptionCode =
        subscriptionPayload?.subscription_code ||
        subscriptionPayload?.code ||
        ""
    const emailToken = subscriptionPayload?.email_token || ""
    const paystackPlanCode =
        subscriptionPayload?.plan?.plan_code ||
        subscriptionPayload?.plan_code ||
        ""
    const customerCode =
        subscriptionPayload?.customer?.customer_code ||
        subscriptionPayload?.customer?.code ||
        subscriptionPayload?.customer ||
        ""

    let planId = resolvePlanIdFromMetadata(metadata)
    if (!planId) {
        planId = getPlanByPaystackCode(paystackPlanCode)?.id || ""
    }

    const userId = resolveUserIdFromMetadata(metadata)
    if (!userId || !planId) {
        console.warn("[billing] Missing userId or planId in webhook payload")
        return null
    }

    const user = await loadUserWithSubscriptionSecrets(userId)
    if (!user) return null

    const previousSubscriptionCode =
        user.subscription?.paystackSubscriptionCode?.trim() || ""

    return activateUserSubscription({
        userId,
        planId,
        subscriptionCode,
        emailToken,
        paystackPlanCode,
        customerCode,
        status:
            subscriptionPayload?.status === "non-renewing"
                ? "non_renewing"
                : "active",
        currentPeriodEnd: parsePaystackDate(
            subscriptionPayload?.next_payment_date ||
                subscriptionPayload?.nextPaymentDate
        ),
        cancelAtPeriodEnd: subscriptionPayload?.status === "non-renewing",
        previousSubscriptionCode,
    })
}

export const getBillingConfig = async (_req, res) => {
    return res.status(200).json({
        configured: paystackConfigured(),
        publicKey: paystackPublicKey(),
        currency: "GHS",
    })
}

export const listBillingPlans = async (req, res) => {
    try {
        const currentPlanId = getPlanSummaryForUser(req.user).planId
        return res.status(200).json(formatBillingPlansPayload(currentPlanId))
    } catch (error) {
        return handleBillingError(res, error)
    }
}

export const getBillingSubscription = async (req, res) => {
    try {
        return res.status(200).json({
            subscription: formatBillingSubscriptionResponse(req.user),
        })
    } catch (error) {
        return handleBillingError(res, error)
    }
}

export const checkoutBillingPlan = async (req, res) => {
    try {
        if (!paystackConfigured()) {
            return res.status(503).json({
                message: "Billing is not configured on the server",
                code: "NOT_CONFIGURED",
            })
        }

        const planId = normalizePlanId(req.body?.planId ?? req.body?.plan ?? "")

        if (!planId || planId === "free") {
            return res.status(400).json({
                message: "Choose a paid plan to upgrade",
            })
        }

        const plan = getPlanById(planId)
        if (!plan) {
            return res.status(400).json({ message: "Unknown plan" })
        }

        if (!plan.paystackPlanCode) {
            return res.status(503).json({
                message: `Plan "${plan.name}" is not configured yet. Add ${plan.paystackPlanCodeEnv} to .env`,
                code: "PLAN_NOT_CONFIGURED",
            })
        }

        await assertPaystackPlanAmountMatches(plan)

        const currentPlanId = getPlanSummaryForUser(req.user).planId
        if (currentPlanId === planId && isPaidSubscriptionActive(req.user)) {
            return res.status(409).json({
                message: "You are already on this plan",
            })
        }

        const user = await loadUserWithSubscriptionSecrets(req.user._id)

        const metadata = {
            userId: String(user._id),
            planId: plan.id,
            accountId: user.accountId?.trim() || "",
        }

        // Paystack requires transaction/initialize (with plan) for customers
        // without a saved card authorization. POST /subscription only works
        // after the customer has already paid once on this integration.
        // Important: when `plan` is set, Paystack charges the plan's amount
        // (not a custom amount) — keep PAYSTACK_PLAN_* codes in sync with catalog.
        const transaction = await initializePaystackTransaction({
            email: user.email,
            plan: plan.paystackPlanCode,
            amountPesewas: planAmountPesewas(plan),
            metadata,
            callbackUrl: billingCallbackUrl(),
        })

        user.subscription.pendingPlanId = planId
        user.subscription.status = "pending"
        await user.save()

        return res.status(200).json({
            message: "Continue payment on Paystack",
            checkout: {
                planId: plan.id,
                planName: plan.name,
                priceGhs: plan.priceGhs,
                amountPesewas: planAmountPesewas(plan),
                currency: "GHS",
                authorizationUrl: transaction.authorization_url,
                accessCode: transaction.access_code,
                reference: transaction.reference || null,
                subscriptionCode: null,
            },
        })
    } catch (error) {
        if (error?.code === "PAYSTACK_PLAN_AMOUNT_MISMATCH") {
            return res.status(503).json({
                message: error.message,
                code: error.code,
            })
        }
        return handleBillingError(res, error)
    }
}

export const cancelBillingSubscription = async (req, res) => {
    try {
        const user = await loadUserWithSubscriptionSecrets(req.user._id)
        const sub = user.subscription ?? {}
        const code = sub.paystackSubscriptionCode?.trim()
        const token = sub.paystackEmailToken?.trim()

        if (!code || !token) {
            return res.status(400).json({
                message: "No active subscription to cancel",
            })
        }

        await disablePaystackSubscription({ code, token })

        resetSubscriptionToFree(user)
        await user.save()

        return res.status(200).json({
            message: "Subscription cancelled. You are now on the Free plan.",
            subscription: formatBillingSubscriptionResponse(user),
        })
    } catch (error) {
        return handleBillingError(res, error)
    }
}

const clearPendingCheckout = async (userId) => {
    const user = await loadUserWithSubscriptionSecrets(userId)
    if (!user) return null

    const sub = user.subscription ?? {}
    if (sub.status !== "pending" && !sub.pendingPlanId) {
        return user
    }

    user.subscription = user.subscription ?? {}
    user.subscription.pendingPlanId = ""

    if (user.subscription.status === "pending") {
        const planId = normalizePlanId(user.subscription.planId)
        const hasExistingPaid =
            planId &&
            planId !== "free" &&
            Boolean(user.subscription.paystackSubscriptionCode?.trim())
        user.subscription.status = hasExistingPaid ? "active" : "free"
        if (!hasExistingPaid) {
            user.subscription.planId = "free"
        }
    }

    await user.save()
    return user
}

export const verifyBillingPayment = async (req, res) => {
    try {
        const reference = String(
            req.query?.reference ?? req.body?.reference ?? ""
        ).trim()

        if (!reference) {
            return res.status(400).json({ message: "Payment reference is required" })
        }

        const transaction = await verifyPaystackTransaction(reference)
        const metadata = transaction.metadata ?? {}
        const userId = resolveUserIdFromMetadata(metadata)
        const planId =
            resolvePlanIdFromMetadata(metadata) ||
            getPlanByPaystackCode(transaction.plan)?.id ||
            ""

        if (!userId || !planId) {
            return res.status(400).json({
                message: "Payment verified but subscription metadata is missing",
            })
        }

        const authedUserId = String(req.user?._id ?? "")
        if (authedUserId && authedUserId !== userId) {
            return res.status(403).json({
                message: "This payment does not belong to the signed-in account",
                code: "PAYMENT_USER_MISMATCH",
                verified: false,
            })
        }

        const paystackStatus = String(transaction.status ?? "")
            .trim()
            .toLowerCase()
        const paid = paystackStatus === "success"

        if (!paid) {
            const user = await clearPendingCheckout(userId)
            return res.status(200).json({
                message:
                    paystackStatus === "abandoned"
                        ? "Payment was not completed"
                        : "Payment was declined or failed",
                verified: false,
                status: paystackStatus || "failed",
                subscription: user
                    ? formatBillingSubscriptionResponse(user)
                    : formatBillingSubscriptionResponse(req.user),
            })
        }

        let subscriptionPayload = null
        if (transaction.subscription_code) {
            try {
                subscriptionPayload = await fetchPaystackSubscription(
                    transaction.subscription_code
                )
            } catch (error) {
                console.warn(
                    `[billing] Could not fetch subscription ${transaction.subscription_code}:`,
                    error.message
                )
            }
        }

        const user = await activateUserSubscription({
            userId,
            planId,
            subscriptionCode:
                subscriptionPayload?.subscription_code ||
                transaction.subscription_code ||
                "",
            emailToken: subscriptionPayload?.email_token || "",
            paystackPlanCode:
                subscriptionPayload?.plan?.plan_code || transaction.plan || "",
            customerCode:
                subscriptionPayload?.customer?.customer_code ||
                transaction.customer?.customer_code ||
                "",
            status: "active",
            currentPeriodEnd: parsePaystackDate(
                subscriptionPayload?.next_payment_date
            ),
        })

        return res.status(200).json({
            message: "Payment verified",
            verified: true,
            status: "success",
            subscription: formatBillingSubscriptionResponse(user),
        })
    } catch (error) {
        return handleBillingError(res, error)
    }
}

export const paystackWebhook = async (req, res) => {
    try {
        const secret = process.env.PAYSTACK_SECRET_KEY?.trim()
        if (!secret) {
            return res.status(503).send("Billing not configured")
        }

        const signature = req.headers["x-paystack-signature"]
        const rawBody = req.body

        if (!signature || !Buffer.isBuffer(rawBody)) {
            return res.status(400).send("Invalid webhook payload")
        }

        const hash = crypto
            .createHmac("sha512", secret)
            .update(rawBody)
            .digest("hex")

        if (hash !== signature) {
            return res.status(401).send("Invalid signature")
        }

        const event = JSON.parse(rawBody.toString("utf8"))
        const eventId = String(event?.data?.id ?? event?.id ?? "")
        const eventType = event?.event || ""

        if (!eventId) {
            return res.status(400).send("Missing event id")
        }

        const reference =
            event?.data?.reference ||
            event?.data?.subscription_code ||
            event?.data?.code ||
            ""

        const metadata = event?.data?.metadata ?? {}
        const webhookUserId = resolveUserIdFromMetadata(metadata)
        const amountRaw =
            event?.data?.amount ??
            event?.data?.requested_amount ??
            event?.data?.paid_amount
        const amount =
            amountRaw != null && Number.isFinite(Number(amountRaw))
                ? Number(amountRaw) / 100
                : null

        const isNew = await markBillingEventProcessed({
            eventId,
            eventType,
            reference,
            userId: webhookUserId || null,
            amount,
            currency: event?.data?.currency || "",
            status: event?.data?.status || eventType || "",
        })

        if (!isNew) {
            return res.status(200).send("Already processed")
        }

        if (
            eventType === "subscription.create" ||
            eventType === "charge.success"
        ) {
            let subscriptionPayload = event.data?.subscription || null

            if (!subscriptionPayload && event.data?.subscription_code) {
                try {
                    subscriptionPayload = await fetchPaystackSubscription(
                        event.data.subscription_code
                    )
                } catch (error) {
                    console.warn(
                        `[billing] Webhook could not load subscription ${event.data.subscription_code}:`,
                        error.message
                    )
                }
            }

            if (subscriptionPayload || resolveUserIdFromMetadata(metadata)) {
                await syncSubscriptionFromPaystackPayload({
                    subscriptionPayload: subscriptionPayload || event.data,
                    metadata: {
                        ...metadata,
                        ...(event.data?.metadata ?? {}),
                    },
                })
            }
        }

        if (
            eventType === "subscription.disable" ||
            eventType === "subscription.not_renew"
        ) {
            const userId = resolveUserIdFromMetadata(metadata)
            if (userId) {
                const user = await User.findById(userId)
                if (user) {
                    resetSubscriptionToFree(user)
                    await user.save()
                }
            }
        }

        if (eventType === "invoice.payment_failed") {
            const userId = resolveUserIdFromMetadata(metadata)
            if (userId) {
                const user = await User.findById(userId)
                if (user) {
                    user.subscription = user.subscription ?? {}
                    user.subscription.status = "past_due"
                    await user.save()
                }
            }
        }

        return res.status(200).send("OK")
    } catch (error) {
        console.error("Paystack webhook error:", error)
        return res.status(500).send("Webhook error")
    }
}
