/** Default free-trial storage cap (5 GiB). */
export const FREE_PLAN_LIMIT_BYTES = 5 * 1024 * 1024 * 1024

/** Free plan length before upgrade is required. */
export const FREE_TRIAL_DAYS = 30

const GIB = 1024 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Checkout / lookup aliases.
 * Canonical ids: free | basic | pro | premium.
 * Legacy: starter → basic, business → pro, studio → premium.
 */
const PLAN_ALIASES = {
    starter: "basic",
    business: "pro",
    studio: "premium",
}

/**
 * Core product capabilities — available on an active free trial and all paid plans.
 * Only keys that map to real product surfaces in this codebase.
 */
const CORE_FEATURE_KEYS = [
    "clientGalleries",
    "shareLinks",
    "clientSelections",
    "passwordProtectedGalleries",
    "downloadControl",
    "textWatermark",
    "bookings",
    "bookingReminders",
    "clientsCrm",
    "incomeTracking",
    "customLabels",
    "analyticsDashboard",
]

const FREE_FEATURE_KEYS = [...CORE_FEATURE_KEYS]

const BASIC_FEATURE_KEYS = [
    ...CORE_FEATURE_KEYS,
    "galleryComments",
    "gallerySets",
    "videoUploads",
    "smsNotifications",
    "videoDash",
]

const PRO_FEATURE_KEYS = [
    ...BASIC_FEATURE_KEYS,
    "customSmsSender",
    "customBranding",
    "advancedAnalytics",
    "restoreTrashItems",
]

const PREMIUM_FEATURE_KEYS = [
    ...PRO_FEATURE_KEYS,
    "galleryAi",
]

/** null maxGalleries = unlimited */
const planDefinitions = [
    {
        id: "free",
        name: "Free",
        storageLimitBytes: FREE_PLAN_LIMIT_BYTES,
        maxGalleries: 3,
        maxTeamMembers: null,
        priceGhs: 0,
        interval: "monthly",
        trialDays: FREE_TRIAL_DAYS,
        paystackPlanCodeEnv: null,
        highlighted: false,
        aliases: [],
        videoUploadLimitBytes: 0,
        description:
            "30-day free trial — up to 3 client galleries, bookings, CRM, and basic analytics. No comments, sets, or video uploads during the trial.",
        perks: [
            "30-day free trial",
            "Up to 3 client galleries",
            "Share links, selections & download control",
            "Bookings, CRM & income tracking",
            "Text watermarks",
            "Analytics dashboard",
            "5 GB storage",
        ],
        featureKeys: FREE_FEATURE_KEYS,
        supportTier: "contact",
    },
    {
        id: "basic",
        name: "Basic",
        storageLimitBytes: 25 * GIB,
        maxGalleries: 10,
        maxTeamMembers: null,
        priceGhs: 40,
        interval: "monthly",
        trialDays: null,
        paystackPlanCodeEnv: "PAYSTACK_PLAN_BASIC",
        paystackPlanCodeEnvFallbacks: ["PAYSTACK_PLAN_STARTER"],
        highlighted: false,
        aliases: ["starter"],
        videoUploadLimitBytes: 5 * GIB,
        description:
            "Basic plan — up to 10 galleries, comments & flags, sets, 5 GB video uploads, SMS, adaptive video, and 25 GB storage.",
        perks: [
            "Everything in Free (ongoing)",
            "Up to 10 client galleries",
            "25 GB storage",
            "Comment & flag images",
            "Gallery sets",
            "Video uploads (up to 5 GB)",
            "SMS client notifications",
            "Adaptive video streaming",
            "Priority support",
        ],
        featureKeys: BASIC_FEATURE_KEYS,
        supportTier: "priority",
    },
    {
        id: "pro",
        name: "Pro",
        storageLimitBytes: 100 * GIB,
        maxGalleries: 50,
        maxTeamMembers: null,
        priceGhs: 70,
        interval: "monthly",
        trialDays: null,
        paystackPlanCodeEnv: "PAYSTACK_PLAN_PRO",
        paystackPlanCodeEnvFallbacks: ["PAYSTACK_PLAN_BUSINESS"],
        highlighted: true,
        aliases: ["business"],
        videoUploadLimitBytes: 10 * GIB,
        description:
            "Pro plan — up to 50 galleries, 10 GB video uploads, custom SMS sender, logo watermark, advanced analytics, trash restore, and 100 GB storage.",
        perks: [
            "Everything in Basic",
            "Up to 50 client galleries",
            "100 GB storage",
            "Video uploads (up to 10 GB)",
            "Custom SMS sender ID",
            "Logo watermark on downloads",
            "Advanced analytics",
            "Restore deleted galleries & photos",
        ],
        featureKeys: PRO_FEATURE_KEYS,
        supportTier: "priority",
    },
    {
        id: "premium",
        name: "Premium",
        storageLimitBytes: 250 * GIB,
        maxGalleries: null,
        maxTeamMembers: null,
        priceGhs: 120,
        interval: "monthly",
        trialDays: null,
        paystackPlanCodeEnv: "PAYSTACK_PLAN_PREMIUM",
        paystackPlanCodeEnvFallbacks: ["PAYSTACK_PLAN_STUDIO"],
        highlighted: false,
        aliases: ["studio"],
        videoUploadLimitBytes: 20 * GIB,
        description:
            "Premium plan — unlimited galleries, 20 GB video uploads, Gallery AI, trash restore, full Pro toolkit, and 250 GB storage.",
        perks: [
            "Everything in Pro",
            "Unlimited client galleries",
            "250 GB storage",
            "Video uploads (up to 20 GB)",
            "Gallery AI descriptions & smart picks",
            "Restore deleted galleries & photos",
            "Premium support",
        ],
        featureKeys: PREMIUM_FEATURE_KEYS,
        supportTier: "premium",
    },
]

/** Runtime overrides loaded from PlanConfig collection. */
let planOverridesById = Object.create(null)

export const normalizePlanId = (planId) => {
    const id = String(planId ?? "free").trim().toLowerCase()
    return PLAN_ALIASES[id] || id
}

export const defaultTrialEndsAt = (fromDate = new Date()) =>
    new Date(new Date(fromDate).getTime() + FREE_TRIAL_DAYS * DAY_MS)

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "non_renewing"])

export const getUserPlanId = (user) => {
    const sub = user?.subscription
    if (!sub) return "free"

    const planId = normalizePlanId(sub.planId)
    if (
        planId &&
        planId !== "free" &&
        ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status)
    ) {
        return planId
    }

    return "free"
}

/**
 * Resolve trial end for a user. Missing trialEndsAt falls back to createdAt + 30 days.
 */
export const getTrialEndsAt = (user) => {
    const raw = user?.subscription?.trialEndsAt
    if (raw) {
        const d = new Date(raw)
        if (!Number.isNaN(d.getTime())) return d
    }
    if (user?.createdAt) {
        return defaultTrialEndsAt(user.createdAt)
    }
    return null
}

/** Free-plan trial still open (paid plans ignore trial). */
export const isFreeTrialActive = (user) => {
    if (getUserPlanId(user) !== "free") return false
    const ends = getTrialEndsAt(user)
    if (!ends) return false
    return ends.getTime() > Date.now()
}

export const isFreeTrialExpired = (user) => {
    if (getUserPlanId(user) !== "free") return false
    return !isFreeTrialActive(user)
}

const resolvePaystackPlanCode = (plan) => {
    const envs = [
        plan?.paystackPlanCodeEnv,
        ...(Array.isArray(plan?.paystackPlanCodeEnvFallbacks)
            ? plan.paystackPlanCodeEnvFallbacks
            : []),
    ].filter(Boolean)

    for (const envName of envs) {
        const code = process.env[envName]?.trim()
        if (code) return code
    }
    return null
}

const mergePlan = (base, override = null) => {
    const merged = {
        ...base,
        ...(override?.name != null && String(override.name).trim()
            ? { name: String(override.name).trim() }
            : {}),
        ...(override?.description != null
            ? { description: String(override.description) }
            : {}),
        ...(override?.storageLimitBytes != null &&
        Number.isFinite(Number(override.storageLimitBytes))
            ? { storageLimitBytes: Number(override.storageLimitBytes) }
            : {}),
        ...(override?.maxGalleries !== undefined
            ? {
                  maxGalleries:
                      override.maxGalleries === null
                          ? null
                          : Number(override.maxGalleries),
              }
            : {}),
        ...(override?.maxTeamMembers !== undefined
            ? {
                  maxTeamMembers:
                      override.maxTeamMembers === null
                          ? null
                          : Number(override.maxTeamMembers),
              }
            : {}),
        ...(override?.priceGhs != null && Number.isFinite(Number(override.priceGhs))
            ? { priceGhs: Number(override.priceGhs) }
            : {}),
        ...(override?.videoUploadLimitBytes !== undefined
            ? {
                  videoUploadLimitBytes:
                      override.videoUploadLimitBytes === null
                          ? null
                          : Number(override.videoUploadLimitBytes),
              }
            : {}),
        ...(Array.isArray(override?.perks) ? { perks: [...override.perks] } : {}),
        ...(Array.isArray(override?.featureKeys)
            ? { featureKeys: [...override.featureKeys] }
            : {}),
        ...(override?.supportTier
            ? { supportTier: String(override.supportTier) }
            : {}),
    }

    return {
        ...merged,
        paystackPlanCode: resolvePaystackPlanCode(merged),
    }
}

const shapePlan = (merged) => ({
    id: merged.id,
    name: merged.name,
    storageLimitBytes: merged.storageLimitBytes,
    maxGalleries: merged.maxGalleries ?? null,
    maxTeamMembers: merged.maxTeamMembers ?? null,
    videoUploadLimitBytes: merged.videoUploadLimitBytes ?? 0,
    priceGhs: merged.priceGhs,
    /** Alias for UI that expects a dollar-style amount (same number as priceGhs). */
    price: merged.priceGhs,
    interval: merged.interval,
    trialDays: merged.trialDays ?? null,
    description: merged.description,
    perks: Array.isArray(merged.perks) ? merged.perks : [],
    featureKeys: Array.isArray(merged.featureKeys) ? merged.featureKeys : [],
    supportTier: merged.supportTier || "contact",
    highlighted: merged.highlighted === true,
    aliases: Array.isArray(merged.aliases) ? merged.aliases : [],
    paystackPlanCode: merged.paystackPlanCode,
    paystackPlanCodeEnv: merged.paystackPlanCodeEnv ?? null,
    available: merged.id === "free" || Boolean(merged.paystackPlanCode),
})

export const setPlanCatalogOverrides = (overrides = {}) => {
    const next = Object.create(null)
    for (const [planId, patch] of Object.entries(overrides)) {
        const id = normalizePlanId(planId)
        if (!id || !patch) continue
        next[id] = patch
    }
    planOverridesById = next
}

export const loadPlanCatalogOverridesFromDb = async (PlanConfigModel) => {
    if (!PlanConfigModel) return
    const { sanitizeFeatureKeys } = await import("./planFeatures.js")
    const rows = await PlanConfigModel.find({}).lean().exec()
    const map = Object.create(null)
    for (const row of rows) {
        const id = normalizePlanId(row.planId)
        if (!id) continue
        map[id] = {
            name: row.name,
            description: row.description,
            storageLimitBytes: row.storageLimitBytes,
            maxGalleries: row.maxGalleries,
            maxTeamMembers: row.maxTeamMembers,
            priceGhs: row.priceGhs,
            videoUploadLimitBytes: row.videoUploadLimitBytes,
            perks: row.perks,
            featureKeys: Array.isArray(row.featureKeys)
                ? sanitizeFeatureKeys(row.featureKeys)
                : row.featureKeys,
            supportTier: row.supportTier,
        }
    }
    setPlanCatalogOverrides(map)
}

export const getPlanDefinitionIds = () => planDefinitions.map((p) => p.id)

export const getAllPlans = () =>
    planDefinitions.map((plan) => {
        const merged = mergePlan(plan, planOverridesById[plan.id])
        return shapePlan(merged)
    })

export const getPlanById = (planId) => {
    const id = normalizePlanId(planId)
    const plan = planDefinitions.find((entry) => entry.id === id)
    if (!plan) return null

    const merged = mergePlan(plan, planOverridesById[id])
    return shapePlan(merged)
}

export const getPlanByPaystackCode = (planCode) => {
    const code = String(planCode ?? "").trim()
    if (!code) return null

    for (const plan of planDefinitions) {
        const merged = mergePlan(plan, planOverridesById[plan.id])
        if (merged.paystackPlanCode === code) {
            return shapePlan(merged)
        }
    }

    return null
}

export const getPaidPlans = () =>
    getAllPlans().filter((plan) => plan.id !== "free")

export const planAmountPesewas = (plan) =>
    Math.round(Number(plan?.priceGhs ?? 0) * 100)

/** Active temporary admin bump on a photographer account. */
export const getActiveLimitOverride = (user) => {
    const override = user?.subscription?.limitOverride
    if (!override) return null

    const hasStorage =
        override.storageLimitBytes != null &&
        Number.isFinite(Number(override.storageLimitBytes))
    const hasGalleries =
        override.maxGalleries != null &&
        Number.isFinite(Number(override.maxGalleries))

    if (!hasStorage && !hasGalleries) return null

    if (override.expiresAt && new Date(override.expiresAt).getTime() < Date.now()) {
        return null
    }

    return {
        storageLimitBytes: hasStorage ? Number(override.storageLimitBytes) : null,
        maxGalleries: hasGalleries ? Number(override.maxGalleries) : null,
        expiresAt: override.expiresAt ?? null,
        reason: override.reason?.trim() || "",
        setAt: override.setAt ?? null,
    }
}

export const getEffectiveStorageLimitBytes = (user) => {
    const override = getActiveLimitOverride(user)
    if (override?.storageLimitBytes != null) {
        return override.storageLimitBytes
    }
    if (isFreeTrialExpired(user)) {
        return 0
    }
    const plan = getPlanById(getUserPlanId(user)) ?? getPlanById("free")
    return plan.storageLimitBytes
}

export const getEffectiveMaxGalleries = (user) => {
    const override = getActiveLimitOverride(user)
    if (override?.maxGalleries != null) {
        return override.maxGalleries
    }
    if (isFreeTrialExpired(user)) {
        return 0
    }
    const plan = getPlanById(getUserPlanId(user)) ?? getPlanById("free")
    return plan.maxGalleries ?? null
}

export const getEffectiveMaxTeamMembers = (user) => {
    const plan = getPlanById(getUserPlanId(user)) ?? getPlanById("free")
    return plan.maxTeamMembers ?? null
}

/** Video storage cap (0 on Free / expired trial). */
export const getEffectiveVideoUploadLimitBytes = (user) => {
    if (isFreeTrialExpired(user)) {
        return 0
    }
    const plan = getPlanById(getUserPlanId(user)) ?? getPlanById("free")
    const n = Number(plan.videoUploadLimitBytes)
    if (!Number.isFinite(n) || n < 0) return 0
    return n
}
