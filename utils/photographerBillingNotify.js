import {
    arkeselConfigured,
    sendArkeselSms,
    ArkeselSmsError,
} from "../services/arkeselSms.js"
import { normalizePhoneForSms } from "./phoneNumber.js"
import { defaultPlatformSmsSender } from "./studioSms.js"
import { getPlanById, normalizePlanId } from "./planCatalog.js"
import {
    notifyPhotographerPlanUpgraded,
    notifyPhotographerPlanRenewalReminder,
    queuePhotographerEmail,
} from "./photographerNotifications.js"

export { ArkeselSmsError }

const smsGloballyEnabled = () =>
    process.env.SMS_NOTIFICATIONS_ENABLED !== "false" &&
    process.env.SMS_NOTIFICATIONS_ENABLED !== "0"

const formatDateLabel = (date) => {
    if (!date) return null
    const value = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(value.getTime())) return null
    return value.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
    })
}

const planLabel = (planId) => {
    const plan = getPlanById(normalizePlanId(planId))
    return plan?.name || String(planId || "plan")
}

const planPriceGhs = (planId) => {
    const plan = getPlanById(normalizePlanId(planId))
    return plan?.priceGhs ?? null
}

/** Platform SMS to the photographer's studio phone (billing alerts). */
export const sendPhotographerBillingSms = async (user, message) => {
    if (!smsGloballyEnabled()) {
        return { skipped: true, reason: "disabled_globally" }
    }
    if (!user?.isActive) {
        return { skipped: true, reason: "inactive_user" }
    }
    if (!arkeselConfigured()) {
        return { skipped: true, reason: "not_configured" }
    }

    const phone = user?.studio?.phone?.trim()
    if (!phone) {
        return { skipped: true, reason: "missing_phone" }
    }

    const recipient = normalizePhoneForSms(phone)
    if (!recipient) {
        return { skipped: true, reason: "invalid_phone" }
    }

    const sender = defaultPlatformSmsSender()
    if (!sender) {
        return { skipped: true, reason: "no_sender" }
    }

    const text = String(message ?? "").trim()
    if (!text) {
        return { skipped: true, reason: "empty_message" }
    }

    const result = await sendArkeselSms({
        sender,
        message: text,
        recipients: [recipient],
    })

    return { sent: true, to: recipient, result }
}

export const queuePhotographerSms = (promise) => {
    promise.catch((error) => {
        console.error("[sms] notification failed:", error.message)
    })
}

const buildUpgradeSms = ({ planName, priceGhs, renewalDateLabel }) => {
    const price =
        priceGhs != null ? ` (GHS ${priceGhs}/month)` : ""
    const renewal = renewalDateLabel
        ? ` Next renewal: ${renewalDateLabel}.`
        : ""
    return `Gidtransfer: You're now on the ${planName} plan${price}.${renewal} Manage billing in the app.`
}

const buildRenewalSms = ({
    planName,
    priceGhs,
    renewalDateLabel,
    daysLeft,
}) => {
    const amount = priceGhs != null ? ` GHS ${priceGhs}.` : ""
    const when = renewalDateLabel ? ` on ${renewalDateLabel}` : ""
    return `Gidtransfer: Your ${planName} plan renews in ${daysLeft} days${when}.${amount} Update billing in the app if needed.`
}

/**
 * Email + SMS after a paid plan upgrade (or plan switch). Fire-and-forget safe.
 */
export const notifyPlanUpgraded = async (user) => {
    if (!user) return { skipped: true, reason: "missing_user" }

    const planId = normalizePlanId(user.subscription?.planId)
    if (!planId || planId === "free") {
        return { skipped: true, reason: "not_paid_plan" }
    }

    const planName = planLabel(planId)
    const priceGhs = planPriceGhs(planId)
    const renewalDateLabel = formatDateLabel(user.subscription?.currentPeriodEnd)
    const upgradedAtLabel = formatDateLabel(user.subscription?.upgradedAt)

    const emailResult = await notifyPhotographerPlanUpgraded({
        user,
        planName,
        priceGhs,
        renewalDateLabel,
        upgradedAtLabel,
    })

    let smsResult = { skipped: true, reason: "not_attempted" }
    try {
        smsResult = await sendPhotographerBillingSms(
            user,
            buildUpgradeSms({ planName, priceGhs, renewalDateLabel })
        )
    } catch (error) {
        console.error("[sms] plan upgrade notify failed:", error.message)
        smsResult = { skipped: true, reason: "error", error: error.message }
    }

    return { email: emailResult, sms: smsResult }
}

export const queueNotifyPlanUpgraded = (user) => {
    queuePhotographerEmail(
        notifyPlanUpgraded(user).then((result) => {
            if (result?.email?.sent || result?.sms?.sent) {
                console.log(
                    `[billing] upgrade notify user=${user?._id} email=${result?.email?.sent ? "sent" : result?.email?.reason || "skip"} sms=${result?.sms?.sent ? "sent" : result?.sms?.reason || "skip"}`
                )
            }
            return result
        })
    )
}

export const notifyPlanRenewalReminder = async (user, { daysLeft = 10 } = {}) => {
    if (!user) return { skipped: true, reason: "missing_user" }

    const planId = normalizePlanId(user.subscription?.planId)
    if (!planId || planId === "free") {
        return { skipped: true, reason: "not_paid_plan" }
    }

    const planName = planLabel(planId)
    const priceGhs = planPriceGhs(planId)
    const renewalDateLabel = formatDateLabel(user.subscription?.currentPeriodEnd)

    const emailResult = await notifyPhotographerPlanRenewalReminder({
        user,
        planName,
        priceGhs,
        renewalDateLabel,
        daysLeft,
    })

    let smsResult = { skipped: true, reason: "not_attempted" }
    try {
        smsResult = await sendPhotographerBillingSms(
            user,
            buildRenewalSms({
                planName,
                priceGhs,
                renewalDateLabel,
                daysLeft,
            })
        )
    } catch (error) {
        console.error("[sms] renewal reminder failed:", error.message)
        smsResult = { skipped: true, reason: "error", error: error.message }
    }

    return { email: emailResult, sms: smsResult }
}
