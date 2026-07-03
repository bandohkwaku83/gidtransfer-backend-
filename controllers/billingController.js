import crypto from "crypto"
import User from "../models/User.js"
import BillingEvent from "../models/BillingEvent.js"
import {
    PaystackError,
    disablePaystackSubscription,
    fetchPaystackSubscription,
    initializePaystackTransaction,
    paystackConfigured,
    paystackPublicKey,
    verifyPaystackTransaction,
} from "../services/paystack.js"
import {
    getPlanById,
    getPlanByPaystackCode,
    planAmountPesewas,
} from "../utils/planCatalog.js"
import {
    applySubscriptionFromPaystack,
    formatBillingPlansResponse,
    formatBillingSubscriptionResponse,
    getPlanSummaryForUser,
    isPaidSubscriptionActive,
    resetSubscriptionToFree,
} from "../utils/subscriptionFields.js"

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

    applySubscriptionFromPaystack({
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

const markBillingEventProcessed = async ({ eventId, eventType, reference }) => {
    try {
        await BillingEvent.create({
            eventId,
            eventType,
            reference: reference || "",
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
        const plans = formatBillingPlansResponse().map((plan) => ({
            ...plan,
            current: plan.id === currentPlanId,
        }))

        return res.status(200).json({ plans })
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

        const planId = String(req.body?.planId ?? req.body?.plan ?? "")
            .trim()
            .toLowerCase()

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
                authorizationUrl: transaction.authorization_url,
                accessCode: transaction.access_code,
                reference: transaction.reference || null,
                subscriptionCode: null,
            },
        })
    } catch (error) {
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
            verified: transaction.status === "success",
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

        const isNew = await markBillingEventProcessed({
            eventId,
            eventType,
            reference,
        })

        if (!isNew) {
            return res.status(200).send("Already processed")
        }

        const metadata = event?.data?.metadata ?? {}

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
