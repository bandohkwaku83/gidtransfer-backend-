import { formatBytesLabel } from "./storageFields.js"
import {
    BILLING_INTERVALS,
    getAccessUntil,
    getActiveLimitOverride,
    getAllPlans,
    getEffectiveMaxGalleries,
    getEffectiveMaxTeamMembers,
    getEffectiveStorageLimitBytes,
    getEffectiveVideoUploadLimitBytes,
    getPlanById,
    getPlanByPaystackCode,
    getTrialEndsAt,
    getUserBillingInterval,
    getUserPlanId,
    hasPaidAccess,
    hasPaidAccessEnded,
    isFreeTrialActive,
    isFreeTrialExpired,
    isInGracePeriod,
    isViewOnlyLocked,
    normalizeBillingInterval,
    normalizePlanId,
    planPriceGhsForInterval,
    SUBSCRIPTION_GRACE_DAYS,
} from "./planCatalog.js"
import {
    formatFeatureCatalog,
    formatPlanComparison,
    getPlanFeatureMap,
    getUserEntitlements,
} from "./planFeatures.js"

export { getUserPlanId } from "./planCatalog.js"

export const isPaidSubscriptionActive = (user) => hasPaidAccess(user)

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
    const interval = hasPaidAccess(user)
        ? getUserBillingInterval(user)
        : BILLING_INTERVALS.monthly
    const priceGhs = planPriceGhsForInterval(plan, interval)
    const viewOnly = isViewOnlyLocked(user)
    const inGracePeriod = isInGracePeriod(user)
    const accessUntil = getAccessUntil(user)

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
        priceGhs,
        price: priceGhs,
        yearlyPriceGhs: plan.yearlyPriceGhs ?? 0,
        interval,
        prices: plan.prices,
        trialDays: plan.trialDays ?? null,
        trialEndsAt,
        trialActive: entitlements.trialActive === true,
        trialExpired: entitlements.trialExpired === true,
        graceDays: SUBSCRIPTION_GRACE_DAYS,
        graceEndsAt: accessUntil,
        inGracePeriod,
        viewOnly,
        perks: plan.perks ?? [],
        features: entitlements.features,
        featureKeys: entitlements.featureKeys,
        supportTier: entitlements.supportTier,
        limitOverride,
        subscription: {
            status: sub.status ?? (plan.id === "free" ? "free" : "none"),
            interval,
            currentPeriodEnd: sub.currentPeriodEnd ?? null,
            renewalDate: sub.currentPeriodEnd ?? null,
            upgradedAt: sub.upgradedAt ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd === true,
            pendingPlanId: sub.pendingPlanId?.trim() || null,
            pendingInterval: normalizeBillingInterval(sub.pendingInterval) || null,
            trialEndsAt,
            trialActive: isFreeTrialActive(user),
            trialExpired: isFreeTrialExpired(user),
            graceDays: SUBSCRIPTION_GRACE_DAYS,
            graceEndsAt: accessUntil,
            inGracePeriod,
            viewOnly,
            willRenew:
                hasPaidAccess(user) &&
                sub.status === "active" &&
                sub.cancelAtPeriodEnd !== true &&
                !viewOnly,
            accessUntil,
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
    yearlyPriceGhs: plan.yearlyPriceGhs ?? 0,
    interval: plan.interval,
    prices: plan.prices,
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
        yearlyPriceGhs: summary.yearlyPriceGhs,
        interval: summary.interval,
        prices: summary.prices,
        trialDays: summary.trialDays,
        trialEndsAt: summary.trialEndsAt,
        trialActive: summary.trialActive,
        trialExpired: summary.trialExpired,
        graceDays: summary.graceDays,
        graceEndsAt: summary.graceEndsAt,
        inGracePeriod: summary.inGracePeriod,
        viewOnly: summary.viewOnly,
        status: summary.subscription.status,
        currentPeriodEnd: summary.subscription.currentPeriodEnd,
        renewalDate: summary.subscription.renewalDate,
        upgradedAt: summary.subscription.upgradedAt,
        cancelAtPeriodEnd: summary.subscription.cancelAtPeriodEnd,
        pendingPlanId: summary.subscription.pendingPlanId,
        pendingInterval: summary.subscription.pendingInterval,
        paystackSubscriptionCode: sub.paystackSubscriptionCode?.trim() || null,
        canManage: isPaidSubscriptionActive(user),
        canCancel:
            isPaidSubscriptionActive(user) &&
            sub.cancelAtPeriodEnd !== true &&
            sub.status !== "non_renewing",
        canResume:
            isPaidSubscriptionActive(user) &&
            (sub.cancelAtPeriodEnd === true || sub.status === "non_renewing"),
        canSwitch: true,
        willRenew: summary.subscription.willRenew === true,
        accessUntil: summary.subscription.accessUntil,
        viewOnly: summary.viewOnly,
        inGracePeriod: summary.inGracePeriod,
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
    interval = "",
}) => {
    user.subscription = user.subscription ?? {}
    const previousPlanId = normalizePlanId(user.subscription.planId) || "free"
    const nextPlanId = normalizePlanId(planId) || "free"
    const previousPeriodEnd = user.subscription.currentPeriodEnd ?? null
    const inferred = getPlanByPaystackCode(paystackPlanCode)
    const nextInterval =
        normalizeBillingInterval(interval) ||
        inferred?.interval ||
        getUserBillingInterval(user) ||
        BILLING_INTERVALS.monthly
    const planChanged =
        previousPlanId !== nextPlanId ||
        getUserBillingInterval(user) !== nextInterval

    user.subscription.planId = nextPlanId
    user.subscription.interval = nextPlanId === "free" ? "" : nextInterval
    user.subscription.status = status
    // Verify often lands before Paystack attaches the subscription. Never wipe
    // codes we already stored (webhook / a later lookup) with empty strings.
    if (subscriptionCode) {
        user.subscription.paystackSubscriptionCode = subscriptionCode
    }
    if (emailToken) {
        user.subscription.paystackEmailToken = emailToken
    }
    if (paystackPlanCode) {
        user.subscription.paystackPlanCode = paystackPlanCode
    }
    if (customerCode) {
        user.subscription.paystackCustomerCode = customerCode
    }
    user.subscription.currentPeriodEnd = currentPeriodEnd ?? null
    user.subscription.cancelAtPeriodEnd = cancelAtPeriodEnd
    user.subscription.pendingPlanId = ""
    user.subscription.pendingInterval = ""

    if (planChanged && nextPlanId !== "free") {
        user.subscription.upgradedAt = new Date()
    }

    // New billing cycle → allow another 5-day renewal reminder.
    if (!sameInstant(previousPeriodEnd, currentPeriodEnd)) {
        user.subscription.renewalReminderPeriodEnd = null
        user.subscription.renewalReminderSentAt = null
    }

    return { planChanged, previousPlanId, nextPlanId, interval: nextInterval }
}

export const resetSubscriptionToFree = (user) => {
    user.subscription = user.subscription ?? {}
    user.subscription.planId = "free"
    user.subscription.status = "free"
    user.subscription.interval = ""
    user.subscription.paystackSubscriptionCode = ""
    user.subscription.paystackEmailToken = ""
    user.subscription.paystackPlanCode = ""
    user.subscription.currentPeriodEnd = null
    user.subscription.upgradedAt = null
    user.subscription.cancelAtPeriodEnd = false
    user.subscription.pendingPlanId = ""
    user.subscription.pendingInterval = ""
    user.subscription.renewalReminderPeriodEnd = null
    user.subscription.renewalReminderSentAt = null
}

/** Stop future charges but keep the paid plan until currentPeriodEnd. */
export const scheduleCancellationAtPeriodEnd = (user, currentPeriodEnd = null) => {
    user.subscription = user.subscription ?? {}
    user.subscription.status = "non_renewing"
    user.subscription.cancelAtPeriodEnd = true
    user.subscription.pendingPlanId = ""
    if (currentPeriodEnd) {
        user.subscription.currentPeriodEnd = currentPeriodEnd
    }
}

/** Turn renewal back on after a period-end cancel. */
export const resumePaidSubscription = (user) => {
    user.subscription = user.subscription ?? {}
    user.subscription.status = "active"
    user.subscription.cancelAtPeriodEnd = false
    user.subscription.pendingPlanId = ""
}

/**
 * Paystack stopped the subscription. Keep paid access until the period we
 * already collected for; otherwise drop to Free (trial is not restarted).
 */
export const applyPaystackSubscriptionStopped = (user, currentPeriodEnd = null) => {
    user.subscription = user.subscription ?? {}
    const end = currentPeriodEnd ?? user.subscription.currentPeriodEnd ?? null
    if (end && !hasPaidAccessEnded(end)) {
        scheduleCancellationAtPeriodEnd(user, end)
        return { droppedToFree: false }
    }
    resetSubscriptionToFree(user)
    return { droppedToFree: true }
}
