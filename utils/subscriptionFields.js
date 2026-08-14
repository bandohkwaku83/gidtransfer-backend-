import { formatBytesLabel } from "./storageFields.js"
import {
    getActiveLimitOverride,
    getAllPlans,
    getEffectiveMaxGalleries,
    getEffectiveMaxTeamMembers,
    getEffectiveStorageLimitBytes,
    getEffectiveVideoUploadLimitBytes,
    getPlanById,
    getTrialEndsAt,
    getUserPlanId,
    isFreeTrialActive,
    isFreeTrialExpired,
    normalizePlanId,
} from "./planCatalog.js"
import {
    formatFeatureCatalog,
    formatPlanComparison,
    getPlanFeatureMap,
    getUserEntitlements,
} from "./planFeatures.js"

export { getUserPlanId } from "./planCatalog.js"

const ACTIVE_STATUSES = new Set(["active", "non_renewing"])

export const isPaidSubscriptionActive = (user) => {
    const sub = user?.subscription ?? {}
    const planId = getUserPlanId(user)
    return planId !== "free" && ACTIVE_STATUSES.has(sub.status)
}

export const getPlanSummaryForUser = (user) => {
    const planId = getUserPlanId(user)
    const plan = getPlanById(planId) ?? getPlanById("free")
    const sub = user?.subscription ?? {}
    const storageLimitBytes = getEffectiveStorageLimitBytes(user)
    const maxGalleries = getEffectiveMaxGalleries(user)
    const maxTeamMembers = getEffectiveMaxTeamMembers(user)
    const videoUploadLimitBytes = getEffectiveVideoUploadLimitBytes(user)
    const limitOverride = getActiveLimitOverride(user)
    const entitlements = getUserEntitlements(user)
    const trialEndsAt = entitlements.trialEndsAt ?? getTrialEndsAt(user)

    return {
        planId: plan.id,
        planName: plan.name,
        planLabel: `${plan.name} plan`,
        storageLimitBytes,
        storageLabel: formatBytesLabel(storageLimitBytes),
        maxGalleries,
        maxTeamMembers,
        videoUploadLimitBytes,
        videoUploadLimitLabel: formatBytesLabel(videoUploadLimitBytes),
        priceGhs: plan.priceGhs,
        price: plan.priceGhs,
        interval: plan.interval,
        trialDays: plan.trialDays ?? null,
        trialEndsAt,
        trialActive: entitlements.trialActive === true,
        trialExpired: entitlements.trialExpired === true,
        perks: plan.perks ?? [],
        features: entitlements.features,
        featureKeys: entitlements.featureKeys,
        supportTier: entitlements.supportTier,
        limitOverride,
        subscription: {
            status: sub.status ?? (plan.id === "free" ? "free" : "none"),
            currentPeriodEnd: sub.currentPeriodEnd ?? null,
            renewalDate: sub.currentPeriodEnd ?? null,
            upgradedAt: sub.upgradedAt ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
            pendingPlanId: sub.pendingPlanId?.trim() || null,
            trialEndsAt,
            trialActive: isFreeTrialActive(user),
            trialExpired: isFreeTrialExpired(user),
        },
    }
}

const formatPublicPlan = (plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    storageLimitBytes: plan.storageLimitBytes,
    storageLabel: formatBytesLabel(plan.storageLimitBytes),
    maxGalleries: plan.maxGalleries ?? null,
    maxTeamMembers: plan.maxTeamMembers ?? null,
    videoUploadLimitBytes: plan.videoUploadLimitBytes ?? 0,
    videoUploadLimitLabel: formatBytesLabel(plan.videoUploadLimitBytes ?? 0),
    perks: plan.perks ?? [],
    features: getPlanFeatureMap(plan),
    featureKeys: plan.featureKeys ?? [],
    supportTier: plan.supportTier || "contact",
    highlighted: plan.highlighted === true,
    aliases: plan.aliases ?? [],
    priceGhs: plan.priceGhs,
    price: plan.priceGhs,
    interval: plan.interval,
    trialDays: plan.trialDays ?? null,
    available: plan.available,
    current: false,
})

export const formatBillingPlansResponse = () =>
    getAllPlans().map(formatPublicPlan)

export const formatBillingPlansPayload = (currentPlanId) => ({
    plans: formatBillingPlansResponse().map((plan) => ({
        ...plan,
        current: plan.id === currentPlanId,
    })),
    featureCatalog: formatFeatureCatalog(),
    comparison: formatPlanComparison(),
})

export const formatBillingSubscriptionResponse = (user) => {
    const summary = getPlanSummaryForUser(user)
    const sub = user?.subscription ?? {}

    return {
        planId: summary.planId,
        planName: summary.planName,
        storageLimitBytes: summary.storageLimitBytes,
        storageLabel: summary.storageLabel,
        maxGalleries: summary.maxGalleries,
        maxTeamMembers: summary.maxTeamMembers,
        videoUploadLimitBytes: summary.videoUploadLimitBytes,
        videoUploadLimitLabel: summary.videoUploadLimitLabel,
        perks: summary.perks,
        features: summary.features,
        featureKeys: summary.featureKeys,
        supportTier: summary.supportTier,
        priceGhs: summary.priceGhs,
        price: summary.priceGhs,
        interval: summary.interval,
        trialDays: summary.trialDays,
        trialEndsAt: summary.trialEndsAt,
        trialActive: summary.trialActive,
        trialExpired: summary.trialExpired,
        status: summary.subscription.status,
        currentPeriodEnd: summary.subscription.currentPeriodEnd,
        renewalDate: summary.subscription.renewalDate,
        upgradedAt: summary.subscription.upgradedAt,
        cancelAtPeriodEnd: summary.subscription.cancelAtPeriodEnd,
        pendingPlanId: summary.subscription.pendingPlanId,
        paystackSubscriptionCode: sub.paystackSubscriptionCode?.trim() || null,
        canManage: isPaidSubscriptionActive(user),
        limitOverride: summary.limitOverride,
    }
}

const sameInstant = (a, b) => {
    if (!a && !b) return true
    if (!a || !b) return false
    return new Date(a).getTime() === new Date(b).getTime()
}

/**
 * Apply Paystack subscription state onto the user.
 * Returns { planChanged, previousPlanId, nextPlanId } for notification gating.
 */
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
    const previousPlanId = normalizePlanId(user.subscription.planId) || "free"
    const nextPlanId = normalizePlanId(planId) || "free"
    const previousPeriodEnd = user.subscription.currentPeriodEnd ?? null
    const planChanged = previousPlanId !== nextPlanId

    user.subscription.planId = nextPlanId
    user.subscription.status = status
    user.subscription.paystackSubscriptionCode = subscriptionCode || ""
    user.subscription.paystackEmailToken = emailToken || ""
    user.subscription.paystackPlanCode = paystackPlanCode || ""
    user.subscription.paystackCustomerCode = customerCode || ""
    user.subscription.currentPeriodEnd = currentPeriodEnd ?? null
    user.subscription.cancelAtPeriodEnd = cancelAtPeriodEnd
    user.subscription.pendingPlanId = ""

    if (planChanged && nextPlanId !== "free") {
        user.subscription.upgradedAt = new Date()
    }

    // New billing cycle → allow another 10-day renewal reminder.
    if (!sameInstant(previousPeriodEnd, currentPeriodEnd)) {
        user.subscription.renewalReminderPeriodEnd = null
        user.subscription.renewalReminderSentAt = null
    }

    return { planChanged, previousPlanId, nextPlanId }
}

export const resetSubscriptionToFree = (user) => {
    user.subscription = user.subscription ?? {}
    user.subscription.planId = "free"
    user.subscription.status = "free"
    user.subscription.paystackSubscriptionCode = ""
    user.subscription.paystackEmailToken = ""
    user.subscription.paystackPlanCode = ""
    user.subscription.currentPeriodEnd = null
    user.subscription.upgradedAt = null
    user.subscription.cancelAtPeriodEnd = false
    user.subscription.pendingPlanId = ""
    user.subscription.renewalReminderPeriodEnd = null
    user.subscription.renewalReminderSentAt = null
}
