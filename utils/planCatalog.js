/** Default free-tier storage cap (5 GiB). */
export const FREE_PLAN_LIMIT_BYTES = 5 * 1024 * 1024 * 1024

const GIB = 1024 * 1024 * 1024

const planDefinitions = [
    {
        id: "free",
        name: "Free",
        storageLimitBytes: FREE_PLAN_LIMIT_BYTES,
        priceGhs: 0,
        interval: null,
        paystackPlanCodeEnv: null,
        description: "5 GB storage for getting started",
    },
    {
        id: "starter",
        name: "Starter",
        storageLimitBytes: 25 * GIB,
        priceGhs: 79,
        interval: "monthly",
        paystackPlanCodeEnv: "PAYSTACK_PLAN_STARTER",
        description: "25 GB storage for growing studios",
    },
    {
        id: "pro",
        name: "Pro",
        storageLimitBytes: 100 * GIB,
        priceGhs: 199,
        interval: "monthly",
        paystackPlanCodeEnv: "PAYSTACK_PLAN_PRO",
        description: "100 GB storage for busy photographers",
    },
    {
        id: "studio",
        name: "Studio",
        storageLimitBytes: 500 * GIB,
        priceGhs: 499,
        interval: "monthly",
        paystackPlanCodeEnv: "PAYSTACK_PLAN_STUDIO",
        description: "500 GB storage for high-volume studios",
    },
]

const resolvePaystackPlanCode = (plan) => {
    if (!plan?.paystackPlanCodeEnv) return null
    const code = process.env[plan.paystackPlanCodeEnv]?.trim()
    return code || null
}

export const getAllPlans = () =>
    planDefinitions.map((plan) => ({
        id: plan.id,
        name: plan.name,
        storageLimitBytes: plan.storageLimitBytes,
        priceGhs: plan.priceGhs,
        interval: plan.interval,
        description: plan.description,
        paystackPlanCode: resolvePaystackPlanCode(plan),
        available: plan.id === "free" || Boolean(resolvePaystackPlanCode(plan)),
    }))

export const getPlanById = (planId) => {
    const id = String(planId ?? "free").trim().toLowerCase()
    const plan = planDefinitions.find((entry) => entry.id === id)
    if (!plan) return null

    return {
        ...plan,
        paystackPlanCode: resolvePaystackPlanCode(plan),
    }
}

export const getPlanByPaystackCode = (planCode) => {
    const code = String(planCode ?? "").trim()
    if (!code) return null

    for (const plan of planDefinitions) {
        if (resolvePaystackPlanCode(plan) === code) {
            return {
                ...plan,
                paystackPlanCode: code,
            }
        }
    }

    return null
}

export const getPaidPlans = () =>
    getAllPlans().filter((plan) => plan.id !== "free")

export const planAmountPesewas = (plan) =>
    Math.round(Number(plan?.priceGhs ?? 0) * 100)

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "non_renewing"])

export const getUserPlanId = (user) => {
    const sub = user?.subscription
    if (!sub) return "free"

    if (
        sub.planId &&
        sub.planId !== "free" &&
        ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status)
    ) {
        return sub.planId
    }

    return "free"
}
