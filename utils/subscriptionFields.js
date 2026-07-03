import { formatBytesLabel } from "./storageFields.js"
import { getAllPlans, getPlanById, getUserPlanId } from "./planCatalog.js"

export { getUserPlanId } from "./planCatalog.js"

const ACTIVE_STATUSES = new Set(["active", "non_renewing"])

export const isPaidSubscriptionActive = (user) => {
    const sub = user?.subscription ?? {}
    return (
        sub.planId &&
        sub.planId !== "free" &&
        ACTIVE_STATUSES.has(sub.status)
    )
}

export const getPlanSummaryForUser = (user) => {
    const planId = getUserPlanId(user)
    const plan = getPlanById(planId) ?? getPlanById("free")
    const sub = user?.subscription ?? {}

    return {
        planId: plan.id,
        planName: plan.name,
        planLabel: `${plan.name} plan`,
        storageLimitBytes: plan.storageLimitBytes,
        storageLabel: formatBytesLabel(plan.storageLimitBytes),
        priceGhs: plan.priceGhs,
        interval: plan.interval,
        subscription: {
            status: sub.status ?? (plan.id === "free" ? "free" : "none"),
            currentPeriodEnd: sub.currentPeriodEnd ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
            pendingPlanId: sub.pendingPlanId?.trim() || null,
        },
    }
}

export const formatBillingPlansResponse = () =>
    getAllPlans().map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        storageLimitBytes: plan.storageLimitBytes,
        storageLabel: formatBytesLabel(plan.storageLimitBytes),
        priceGhs: plan.priceGhs,
        interval: plan.interval,
        available: plan.available,
        current: false,
    }))

export const formatBillingSubscriptionResponse = (user) => {
    const summary = getPlanSummaryForUser(user)
    const sub = user?.subscription ?? {}

    return {
        planId: summary.planId,
        planName: summary.planName,
        storageLimitBytes: summary.storageLimitBytes,
        storageLabel: summary.storageLabel,
        priceGhs: summary.priceGhs,
        interval: summary.interval,
        status: summary.subscription.status,
        currentPeriodEnd: summary.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: summary.subscription.cancelAtPeriodEnd,
        pendingPlanId: summary.subscription.pendingPlanId,
        paystackSubscriptionCode: sub.paystackSubscriptionCode?.trim() || null,
        canManage: isPaidSubscriptionActive(user),
    }
}

export const applySubscriptionFromPaystack = ({
    user,
    planId,
    subscriptionCode,
    emailToken,
    paystackPlanCode,
    customerCode,
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd = false,
}) => {
    user.subscription = user.subscription ?? {}
    user.subscription.planId = planId
    user.subscription.status = status
    user.subscription.paystackSubscriptionCode = subscriptionCode || ""
    user.subscription.paystackEmailToken = emailToken || ""
    user.subscription.paystackPlanCode = paystackPlanCode || ""
    user.subscription.paystackCustomerCode = customerCode || ""
    user.subscription.currentPeriodEnd = currentPeriodEnd ?? null
    user.subscription.cancelAtPeriodEnd = cancelAtPeriodEnd
    user.subscription.pendingPlanId = ""
}

export const resetSubscriptionToFree = (user) => {
    user.subscription = user.subscription ?? {}
    user.subscription.planId = "free"
    user.subscription.status = "free"
    user.subscription.paystackSubscriptionCode = ""
    user.subscription.paystackEmailToken = ""
    user.subscription.paystackPlanCode = ""
    user.subscription.currentPeriodEnd = null
    user.subscription.cancelAtPeriodEnd = false
    user.subscription.pendingPlanId = ""
}
