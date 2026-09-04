/** Default free-trial storage cap (5 GiB). */
export const FREE_PLAN_LIMIT_BYTES = 5 * 1024 * 1024 * 1024

/** Free plan length before upgrade is required. */
export const FREE_TRIAL_DAYS = 30

/**
 * After the billed period or trial ends, the photographer keeps full access
 * for this many days. After that they can only view existing work.
 */
export const SUBSCRIPTION_GRACE_DAYS = 3

const GIB = 1024 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

export const BILLING_INTERVALS = {
    monthly: "monthly",
    yearly: "yearly",
}

const PAYSTACK_INTERVAL_BY_OURS = {
    monthly: "monthly",
    yearly: "annually",
}

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
    "collaboration",
    "studioTeam",
]

/** null maxGalleries = unlimited */
const planDefinitions = [
    {
        id: "free",
        name: "Free",
        storageLimitBytes: FREE_PLAN_LIMIT_BYTES,
        maxGalleries: 3,
        maxTeamMembers: 0,
        priceGhs: 0,
        yearlyPriceGhs: 0,
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
        maxTeamMembers: 0,
        priceGhs: 32,
        yearlyPriceGhs: 380,
        interval: "monthly",
        trialDays: null,
        paystackPlanCodeEnv: "PAYSTACK_PLAN_BASIC",
        paystackPlanCodeEnvFallbacks: ["PAYSTACK_PLAN_STARTER"],
        paystackYearlyPlanCodeEnv: "PAYSTACK_PLAN_BASIC_YEARLY",
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
        maxTeamMembers: 0,
        priceGhs: 60,
        yearlyPriceGhs: 650,
        interval: "monthly",
        trialDays: null,
        paystackPlanCodeEnv: "PAYSTACK_PLAN_PRO",
        paystackPlanCodeEnvFallbacks: ["PAYSTACK_PLAN_BUSINESS"],
        paystackYearlyPlanCodeEnv: "PAYSTACK_PLAN_PRO_YEARLY",
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
        maxTeamMembers: 10,
        priceGhs: 120,
        yearlyPriceGhs: 1300,
        interval: "monthly",
        trialDays: null,
        paystackPlanCodeEnv: "PAYSTACK_PLAN_PREMIUM",
        paystackPlanCodeEnvFallbacks: ["PAYSTACK_PLAN_STUDIO"],
        paystackYearlyPlanCodeEnv: "PAYSTACK_PLAN_PREMIUM_YEARLY",
        highlighted: false,
        aliases: ["studio"],
        videoUploadLimitBytes: 20 * GIB,
        description:
            "Premium plan — unlimited galleries, 20 GB video uploads, Gallery AI, studio team, team collaboration, trash restore, full Pro toolkit, and 250 GB storage.",
        perks: [
            "Everything in Pro",
            "Unlimited client galleries",
            "250 GB storage",
            "Video uploads (up to 20 GB)",
            "Gallery AI descriptions & smart picks",
            "Studio team (create users, roles & menus)",
            "Team collaboration (up to 10 members)",
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

export const normalizeBillingInterval = (interval) => {
    const raw = String(interval ?? "").trim().toLowerCase()
    if (raw === "yearly" || raw === "annual" || raw === "annually" || raw === "year") {
        return BILLING_INTERVALS.yearly
    }
    if (raw === "monthly" || raw === "month") {
        return BILLING_INTERVALS.monthly
    }
    return ""
}

export const paystackIntervalFor = (interval) =>
    PAYSTACK_INTERVAL_BY_OURS[normalizeBillingInterval(interval)] || "monthly"

export const addUtcDays = (date, days) => {
    const value = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(value.getTime())) return null
    return new Date(value.getTime() + Number(days) * DAY_MS)
}

export const defaultTrialEndsAt = (fromDate = new Date()) =>
    addUtcDays(fromDate, FREE_TRIAL_DAYS)

const PAID_ACCESS_STATUSES = new Set([
    "active",
    "non_renewing",
    "past_due",
    "pending",
])

/** True when the billed period has ended (no date = still in period). */
export const hasPaidPeriodEnded = (currentPeriodEnd, now = new Date()) => {
    if (!currentPeriodEnd) return false
    const end = new Date(currentPeriodEnd)
    if (Number.isNaN(end.getTime())) return false
    return end.getTime() <= now.getTime()
}

/** Last moment paid features stay on: period end + grace days. */
export const getPaidAccessEndsAt = (currentPeriodEnd) => {
    if (!currentPeriodEnd) return null
    return addUtcDays(currentPeriodEnd, SUBSCRIPTION_GRACE_DAYS)
}

export const hasPaidAccessEnded = (currentPeriodEnd, now = new Date()) => {
    const ends = getPaidAccessEndsAt(currentPeriodEnd)
    if (!ends) return false
    return ends.getTime() <= now.getTime()
}

/**
 * Paid features stay on until period end + 3-day grace — including after
 * cancel (`non_renewing`), past_due, and while switching (`pending` with a sub).
 * After grace with no renewal, access drops (view-only).
 */
export const hasPaidAccess = (user, now = new Date()) => {
    const sub = user?.subscription
    if (!sub) return false

    const planId = normalizePlanId(sub.planId)
    if (!planId || planId === "free") return false
    if (!PAID_ACCESS_STATUSES.has(sub.status)) return false

    if (sub.status === "pending" && !sub.paystackSubscriptionCode?.trim()) {
        return false
    }

    if (hasPaidAccessEnded(sub.currentPeriodEnd, now)) {
        return false
    }

    return true
}

export const getUserPlanId = (user) => {
    if (!hasPaidAccess(user)) return "free"
    return normalizePlanId(user?.subscription?.planId) || "free"
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

export const getTrialAccessEndsAt = (user) => {
    const ends = getTrialEndsAt(user)
    if (!ends) return null
    return addUtcDays(ends, SUBSCRIPTION_GRACE_DAYS)
}

/** Free-plan trial still open (paid plans ignore trial). Does not include grace. */
export const isFreeTrialActive = (user, now = new Date()) => {
    if (getUserPlanId(user) !== "free") return false
    const ends = getTrialEndsAt(user)
    if (!ends) return false
    return ends.getTime() > now.getTime()
}

/** Trial calendar ended, but the 3-day grace window is still open. */
export const isFreeTrialInGrace = (user, now = new Date()) => {
    if (getUserPlanId(user) !== "free") return false
    if (isFreeTrialActive(user, now)) return false
    const graceEnds = getTrialAccessEndsAt(user)
    if (!graceEnds) return false
    return graceEnds.getTime() > now.getTime()
}

/** Trial + grace have both ended — photographer is view-only until they subscribe. */
export const isFreeTrialExpired = (user, now = new Date()) => {
    if (getUserPlanId(user) !== "free") return false
    return !isFreeTrialActive(user, now) && !isFreeTrialInGrace(user, now)
}

export const isPaidInGrace = (user, now = new Date()) => {
    if (!hasPaidAccess(user, now)) return false
    return hasPaidPeriodEnded(user?.subscription?.currentPeriodEnd, now)
}

/** Paid or trial period has ended, but the 3-day grace window is still open. */
export const isInGracePeriod = (user, now = new Date()) =>
    isPaidInGrace(user, now) || isFreeTrialInGrace(user, now)

/**
 * After grace with no renewal: photographer can view existing work only.
 * Billing checkout / verify stay allowed so they can subscribe again.
 */
export const isViewOnlyLocked = (user, now = new Date()) =>
    !hasPaidAccess(user, now) && isFreeTrialExpired(user, now)

export const getAccessUntil = (user) => {
    if (hasPaidAccess(user) || user?.subscription?.currentPeriodEnd) {
        const paidEnds = getPaidAccessEndsAt(user?.subscription?.currentPeriodEnd)
        if (paidEnds) return paidEnds
    }
    return getTrialAccessEndsAt(user)
}

export const getUserBillingInterval = (user) => {
    const stored = normalizeBillingInterval(user?.subscription?.interval)
    if (stored) return stored
    const fromCode = getPlanByPaystackCode(user?.subscription?.paystackPlanCode)
    if (fromCode?.interval) return fromCode.interval
    return BILLING_INTERVALS.monthly
}

export const planPriceGhsForInterval = (plan, interval) => {
    const resolved = normalizeBillingInterval(interval) || BILLING_INTERVALS.monthly
    if (resolved === BILLING_INTERVALS.yearly) {
        return Number(plan?.yearlyPriceGhs ?? plan?.priceGhs ?? 0)
    }
    return Number(plan?.priceGhs ?? 0)
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
        ...(override?.yearlyPriceGhs != null &&
        Number.isFinite(Number(override.yearlyPriceGhs))
            ? { yearlyPriceGhs: Number(override.yearlyPriceGhs) }
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
        yearlyPaystackPlanCode: resolvePaystackPlanCode({
            ...merged,
            paystackPlanCodeEnv: merged.paystackYearlyPlanCodeEnv,
            paystackPlanCodeEnvFallbacks: [],
        }),
    }
}

const shapePlan = (merged) => {
    const monthlyAvailable =
        merged.id === "free" || Boolean(merged.paystackPlanCode)
    const yearlyAvailable =
        merged.id === "free" || Boolean(merged.yearlyPaystackPlanCode)

    return {
        id: merged.id,
        name: merged.name,
        storageLimitBytes: merged.storageLimitBytes,
        maxGalleries: merged.maxGalleries ?? null,
        maxTeamMembers: merged.maxTeamMembers ?? null,
        videoUploadLimitBytes: merged.videoUploadLimitBytes ?? 0,
        priceGhs: merged.priceGhs,
        /** Alias for UI that expects a dollar-style amount (same number as priceGhs). */
        price: merged.priceGhs,
        yearlyPriceGhs: merged.yearlyPriceGhs ?? 0,
        interval: merged.interval,
        prices: {
            monthly: {
                interval: BILLING_INTERVALS.monthly,
                priceGhs: merged.priceGhs,
                price: merged.priceGhs,
                paystackPlanCode: merged.paystackPlanCode ?? null,
                available: monthlyAvailable,
            },
            yearly: {
                interval: BILLING_INTERVALS.yearly,
                priceGhs: merged.yearlyPriceGhs ?? 0,
                price: merged.yearlyPriceGhs ?? 0,
                paystackPlanCode: merged.yearlyPaystackPlanCode ?? null,
                available: yearlyAvailable,
            },
        },
        trialDays: merged.trialDays ?? null,
        description: merged.description,
        perks: Array.isArray(merged.perks) ? merged.perks : [],
        featureKeys: Array.isArray(merged.featureKeys) ? merged.featureKeys : [],
        supportTier: merged.supportTier || "contact",
        highlighted: merged.highlighted === true,
        aliases: Array.isArray(merged.aliases) ? merged.aliases : [],
        paystackPlanCode: merged.paystackPlanCode,
        paystackPlanCodeEnv: merged.paystackPlanCodeEnv ?? null,
        yearlyPaystackPlanCode: merged.yearlyPaystackPlanCode ?? null,
        paystackYearlyPlanCodeEnv: merged.paystackYearlyPlanCodeEnv ?? null,
        available: monthlyAvailable || yearlyAvailable,
        graceDays: SUBSCRIPTION_GRACE_DAYS,
    }
}

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
            yearlyPriceGhs: row.yearlyPriceGhs,
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

    for (const plan of getAllPlans()) {
        if (plan.paystackPlanCode === code) {
            return getCheckoutPlan(plan.id, BILLING_INTERVALS.monthly)
        }
        if (plan.yearlyPaystackPlanCode === code) {
            return getCheckoutPlan(plan.id, BILLING_INTERVALS.yearly)
        }
    }

    return null
}

export const getPaidPlans = () =>
    getAllPlans().filter((plan) => plan.id !== "free")

export const getCheckoutPlan = (planId, interval = BILLING_INTERVALS.monthly) => {
    const plan = getPlanById(planId)
    if (!plan) return null

    const resolved =
        normalizeBillingInterval(interval) || BILLING_INTERVALS.monthly
    const yearly = resolved === BILLING_INTERVALS.yearly
    const priceGhs = planPriceGhsForInterval(plan, resolved)
    const paystackPlanCode = yearly
        ? plan.yearlyPaystackPlanCode
        : plan.paystackPlanCode
    const paystackPlanCodeEnv = yearly
        ? plan.paystackYearlyPlanCodeEnv
        : plan.paystackPlanCodeEnv

    return {
        ...plan,
        interval: resolved,
        priceGhs,
        price: priceGhs,
        paystackPlanCode,
        paystackPlanCodeEnv,
        available: plan.id === "free" || Boolean(paystackPlanCode),
    }
}

export const planAmountPesewas = (plan) =>
    Math.round(Number(plan?.priceGhs ?? 0) * 100)

export const checkoutAmountPesewas = (planId, interval) =>
    planAmountPesewas(getCheckoutPlan(planId, interval))

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
