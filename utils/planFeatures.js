import { formatBytesLabel } from "./storageFields.js"
import {
    getAllPlans,
    getPlanById,
    getAccessUntil,
    getTrialAccessEndsAt,
    getTrialEndsAt,
    getUserPlanId,
    isFreeTrialActive,
    isFreeTrialExpired,
    isFreeTrialInGrace,
    isInGracePeriod,
    isViewOnlyLocked,
    SUBSCRIPTION_GRACE_DAYS,
} from "./planCatalog.js"
import { cacheGetOrSet, cacheDeletePrefix } from "./memoryCache.js"

const OWNER_FEATURE_CACHE_TTL_MS = Math.max(
    0,
    Number(process.env.OWNER_FEATURE_CACHE_TTL_MS ?? 30_000)
)

/**
 * Entitlement keys that map to real product surfaces.
 * Boolean features only — storage / gallery caps live on the plan.
 */
export const FEATURE_CATALOG = [
    {
        key: "clientGalleries",
        label: "Client galleries",
        category: "galleries",
        description:
            "Create a private gallery for each client or shoot, with cover, photos, and videos.",
    },
    {
        key: "shareLinks",
        label: "Share links",
        category: "galleries",
        description:
            "Send a public gallery URL (or share token) so the client can open proofs in the browser. Optional link expiry.",
    },
    {
        key: "clientSelections",
        label: "Client selections",
        category: "galleries",
        description:
            "Clients heart / pick their favorite photos and videos. The photographer sees picks and selection progress.",
    },
    {
        key: "passwordProtectedGalleries",
        label: "Password-protected galleries",
        category: "galleries",
        description:
            "Require a password before anyone can view the shared gallery.",
    },
    {
        key: "downloadControl",
        label: "Download control",
        category: "galleries",
        description:
            "Choose whether clients can download originals, previews only, or nothing — per gallery.",
    },
    {
        key: "restoreTrashItems",
        label: "Restore deleted galleries & photos",
        category: "trash",
        description:
            "Restore soft-deleted galleries/photos from the trash view while the restore window is still active.",
    },
    {
        key: "textWatermark",
        label: "Text watermarks",
        category: "branding",
        description:
            "Burn a text watermark onto selection / preview thumbnails so proofs stay protected.",
    },
    {
        key: "bookings",
        label: "Bookings",
        category: "studio",
        description:
            "Schedule shoots on a calendar with client, shoot type, time, location, and fees.",
    },
    {
        key: "bookingReminders",
        label: "Booking reminders",
        category: "studio",
        description:
            "Automatic email / calendar reminders before an upcoming shoot.",
    },
    {
        key: "clientsCrm",
        label: "Client CRM",
        category: "studio",
        description:
            "Store client names, phones, emails, and notes in one studio client list.",
    },
    {
        key: "incomeTracking",
        label: "Income tracking",
        category: "studio",
        description:
            "Record payments from bookings and see income summaries over time.",
    },
    {
        key: "customLabels",
        label: "Custom labels & tags",
        category: "organization",
        description:
            "Organize work with gallery types, client notes, and photo tags.",
    },
    {
        key: "analyticsDashboard",
        label: "Analytics dashboard",
        category: "insights",
        description:
            "See how many times a gallery link was opened, how many picks clients made, and selection rate.",
    },
    {
        key: "galleryComments",
        label: "Comment & flag images",
        category: "galleries",
        description:
            "Clients can leave comments on photos and flag finals that need a fix.",
    },
    {
        key: "gallerySets",
        label: "Sets",
        category: "galleries",
        description:
            "Group photos into named sets within a gallery (ceremony, portraits, and so on).",
    },
    {
        key: "videoUploads",
        label: "Video uploads",
        category: "media",
        description:
            "Upload videos to a gallery. Caps: 5 GB on Basic, 10 GB on Pro, 20 GB on Premium.",
    },
    {
        key: "smsNotifications",
        label: "SMS notifications",
        category: "comms",
        description:
            "Text the client when a gallery is shared (uses the platform default SMS sender).",
    },
    {
        key: "customSmsSender",
        label: "Custom SMS sender ID",
        category: "comms",
        description:
            "Send SMS under your studio name instead of the platform default (subject to approval).",
    },
    {
        key: "videoDash",
        label: "Adaptive video streaming",
        category: "media",
        description:
            "Deliver gallery videos with MPEG-DASH so playback quality adapts to the client’s network (smoother viewing on slow connections).",
    },
    {
        key: "customBranding",
        label: "Logo watermark on downloads",
        category: "branding",
        description:
            "Place your studio logo on images when clients download — protects your brand beyond text watermarks.",
    },
    {
        key: "advancedAnalytics",
        label: "Advanced analytics",
        category: "insights",
        description:
            "Deeper gallery insights: 7-day activity charts and download counts, not just basic views and picks.",
    },
    {
        key: "galleryAi",
        label: "Gallery AI",
        category: "ai",
        description:
            "AI helps on both sides: the photographer can generate gallery descriptions; the client can start AI smart picks that score photos (quality, faces, blur), skip near-duplicates, and suggest a diverse set to heart in one tap.",
    },
    {
        key: "collaboration",
        label: "Team collaboration",
        category: "studio",
        description:
            "Create shared project workspaces, invite registered photographers as editors or viewers, and upload media together. Seat limit is set by the plan (maxTeamMembers).",
    },
    {
        key: "studioTeam",
        label: "Studio team",
        category: "studio",
        description:
            "Create staff user accounts for your studio, assign roles, and control which app menus each person can access. Seat limit is set by the plan (maxTeamMembers).",
    },
]

const FEATURE_KEY_SET = new Set(FEATURE_CATALOG.map((item) => item.key))

export const SUPPORT_TIERS = {
    contact: "contact",
    priority: "priority",
    premium: "premium",
}

const featureMapFromKeys = (keys = []) => {
    const enabled = new Set(keys)
    const map = Object.create(null)
    for (const item of FEATURE_CATALOG) {
        map[item.key] = enabled.has(item.key)
    }
    // Back-compat aliases used by earlier frontend snippets
    map.basicAnalytics = map.analyticsDashboard === true
    map.emailSupport = false
    map.adFree = false
    map.apiAccess = false
    map.advancedDashboard = false
    return map
}

export const isKnownFeatureKey = (key) => FEATURE_KEY_SET.has(String(key ?? ""))

export const sanitizeFeatureKeys = (keys) => {
    if (!Array.isArray(keys)) return null
    const next = []
    const seen = new Set()
    for (const raw of keys) {
        const key = String(raw ?? "").trim()
        if (!FEATURE_KEY_SET.has(key) || seen.has(key)) continue
        seen.add(key)
        next.push(key)
    }
    return next
}

export const getPlanFeatureKeys = (planOrId, { user = null } = {}) => {
    const plan =
        planOrId && typeof planOrId === "object"
            ? planOrId
            : getPlanById(planOrId) ?? getPlanById("free")
    const keys = Array.isArray(plan?.featureKeys) ? plan.featureKeys : []
    const known = keys.filter((key) => FEATURE_KEY_SET.has(key))

    // Free plan grants features during the 30-day trial and the 3-day grace.
    if (
        plan?.id === "free" &&
        user &&
        !isFreeTrialActive(user) &&
        !isFreeTrialInGrace(user)
    ) {
        return []
    }

    return known
}

export const getPlanFeatureMap = (planOrId, options) =>
    featureMapFromKeys(getPlanFeatureKeys(planOrId, options))

export const userHasFeature = (user, featureKey) => {
    const key = String(featureKey ?? "").trim()
    const resolved =
        key === "basicAnalytics"
            ? "analyticsDashboard"
            : key === "emailSupport"
              ? null
              : key
    if (!resolved || !FEATURE_KEY_SET.has(resolved)) return false
    return getPlanFeatureMap(getUserPlanId(user), { user })[resolved] === true
}

export const getUserEntitlements = (user) => {
    const plan = getPlanById(getUserPlanId(user)) ?? getPlanById("free")
    const featureKeys = getPlanFeatureKeys(plan, { user })
    const features = featureMapFromKeys(featureKeys)
    const trialEndsAt = getTrialEndsAt(user)
    const trialActive = isFreeTrialActive(user)
    const trialExpired = isFreeTrialExpired(user)
    const inGracePeriod = isInGracePeriod(user)
    const viewOnly = isViewOnlyLocked(user)
    const graceEndsAt = getAccessUntil(user)

    let supportTier = SUPPORT_TIERS.contact
    if (plan.id === "premium") supportTier = SUPPORT_TIERS.premium
    else if (plan.id === "basic" || plan.id === "pro")
        supportTier = SUPPORT_TIERS.priority
    else if (plan.supportTier) supportTier = plan.supportTier

    return {
        planId: plan.id,
        planName: plan.name,
        features,
        featureKeys,
        supportTier,
        maxTeamMembers: plan.maxTeamMembers ?? null,
        trialDays: plan.trialDays ?? null,
        trialEndsAt,
        trialActive,
        trialExpired,
        trialGraceEndsAt: getTrialAccessEndsAt(user),
        graceDays: SUBSCRIPTION_GRACE_DAYS,
        graceEndsAt,
        inGracePeriod,
        viewOnly,
    }
}

export const plansThatIncludeFeature = (featureKey) => {
    const key = String(featureKey ?? "").trim()
    const resolved = key === "basicAnalytics" ? "analyticsDashboard" : key
    return getAllPlans()
        .filter((plan) => {
            const keys = Array.isArray(plan.featureKeys) ? plan.featureKeys : []
            return keys.includes(resolved)
        })
        .map((plan) => ({ id: plan.id, name: plan.name }))
}

export const featureDeniedPayload = (featureKey, { user } = {}) => {
    const key = String(featureKey ?? "").trim()
    const resolved = key === "basicAnalytics" ? "analyticsDashboard" : key
    const catalog = FEATURE_CATALOG.find((item) => item.key === resolved)
    const requiredPlans = plansThatIncludeFeature(resolved)
    const label = catalog?.label || key
    const names = requiredPlans.map((plan) => plan.name)
    const planList =
        names.length === 0
            ? "a paid plan"
            : names.length === 1
              ? `the ${names[0]} plan`
              : `the ${names.slice(0, -1).join(", ")} or ${names.at(-1)} plan`

    return {
        message: `${label} is available on ${planList}.`,
        code: "PLAN_FEATURE_REQUIRED",
        feature: resolved,
        requiredPlans: requiredPlans.map((plan) => plan.id),
        currentPlanId: user ? getUserPlanId(user) : null,
        trialExpired: user ? isFreeTrialExpired(user) : false,
        viewOnly: user ? isViewOnlyLocked(user) : false,
        inGracePeriod: user ? isInGracePeriod(user) : false,
        graceEndsAt: user ? getAccessUntil(user) : null,
    }
}

export const sendFeatureDenied = (res, featureKey, { user } = {}) =>
    res.status(403).json(featureDeniedPayload(featureKey, { user }))

export const viewOnlyDeniedPayload = (user) => {
    const trialExpired = user ? isFreeTrialExpired(user) : false
    return {
        message: trialExpired
            ? "Your free trial has ended. You can view existing work, but subscribe to create or change anything."
            : "Your subscription has ended. You can view existing work, but renew to create or change anything.",
        code: "SUBSCRIPTION_VIEW_ONLY",
        viewOnly: true,
        trialExpired,
        inGracePeriod: false,
        graceDays: SUBSCRIPTION_GRACE_DAYS,
        graceEndsAt: user ? getAccessUntil(user) : null,
        currentPlanId: user ? getUserPlanId(user) : null,
    }
}

export const sendViewOnlyDenied = (res, user) =>
    res.status(403).json(viewOnlyDeniedPayload(user))

export const formatFeatureCatalog = () =>
    FEATURE_CATALOG.map((item) => ({
        key: item.key,
        label: item.label,
        category: item.category,
        description: item.description,
    }))

export const formatPlanComparison = () => {
    const plans = getAllPlans()
    const marketingKeys = [
        "clientGalleries",
        "shareLinks",
        "clientSelections",
        "analyticsDashboard",
        "galleryComments",
        "gallerySets",
        "smsNotifications",
        "customSmsSender",
        "videoDash",
        "customBranding",
        "advancedAnalytics",
        "galleryAi",
        "collaboration",
        "studioTeam",
        "restoreTrashItems",
    ]

    const rows = [
        {
            key: "price",
            label: "Price",
            category: "limits",
            values: Object.fromEntries(
                plans.map((plan) => [
                    plan.id,
                    plan.id === "free"
                        ? "GHS 0 / 30-day trial"
                        : `GHS ${Number(plan.priceGhs)} / month`,
                ])
            ),
        },
        {
            key: "yearlyPriceGhs",
            label: "Yearly price",
            category: "limits",
            values: Object.fromEntries(
                plans.map((plan) => [
                    plan.id,
                    plan.id === "free"
                        ? "—"
                        : `GHS ${Number(plan.yearlyPriceGhs)} / year`,
                ])
            ),
        },
        {
            key: "storageLimitBytes",
            label: "Storage",
            category: "limits",
            values: Object.fromEntries(
                plans.map((plan) => [
                    plan.id,
                    formatBytesLabel(plan.storageLimitBytes),
                ])
            ),
        },
        {
            key: "maxGalleries",
            label: "Galleries",
            category: "limits",
            values: Object.fromEntries(
                plans.map((plan) => [
                    plan.id,
                    plan.maxGalleries == null
                        ? "Unlimited"
                        : String(plan.maxGalleries),
                ])
            ),
        },
        {
            key: "videoUploadLimitBytes",
            label: "Video storage",
            category: "limits",
            values: Object.fromEntries(
                plans.map((plan) => [
                    plan.id,
                    !plan.videoUploadLimitBytes
                        ? "—"
                        : formatBytesLabel(plan.videoUploadLimitBytes),
                ])
            ),
        },
        ...FEATURE_CATALOG.filter((item) => marketingKeys.includes(item.key)).map(
            (item) => ({
                key: item.key,
                label: item.label,
                category: item.category,
                values: Object.fromEntries(
                    plans.map((plan) => [
                        plan.id,
                        getPlanFeatureKeys(plan).includes(item.key),
                    ])
                ),
            })
        ),
    ]

    return rows
}

const loadOwnerForFeatures = async (ownerId) => {
    const { default: User } = await import("../models/User.js")
    return User.findById(ownerId).select("subscription createdAt").lean()
}

/** Owner lookup for public / background jobs, cached briefly to avoid churn. */
export const ownerHasFeature = async (ownerId, featureKey) => {
    if (!ownerId) return false
    const key = String(ownerId)
    if (OWNER_FEATURE_CACHE_TTL_MS <= 0) {
        const user = await loadOwnerForFeatures(ownerId)
        return userHasFeature(user, featureKey)
    }

    const user = await cacheGetOrSet(
        `planFeatures:owner:${key}`,
        () => loadOwnerForFeatures(ownerId),
        OWNER_FEATURE_CACHE_TTL_MS
    )
    return userHasFeature(user, featureKey)
}

/** Invalidate cached owner features (call after subscription changes). */
export const invalidateOwnerFeatureCache = (ownerId) => {
    if (!ownerId) return
    cacheDeletePrefix(`planFeatures:owner:${String(ownerId)}`)
}
