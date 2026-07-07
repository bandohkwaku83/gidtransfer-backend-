import { formatUserResponse } from "./formatUserResponse.js"
import { formatBillingSubscriptionResponse } from "./subscriptionFields.js"
import { formatBytesLabel } from "./storageFields.js"
import { getPlanById } from "./planCatalog.js"

const escapeRegex = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const buildPhotographerSearchFilter = (search) => {
    const q = String(search ?? "").trim()
    if (!q) return {}

    const regex = new RegExp(escapeRegex(q), "i")
    return {
        $or: [
            { email: regex },
            { accountId: regex },
            { "studio.companyName": regex },
            { "studio.companySlug": regex },
        ],
    }
}

const parseBooleanQuery = (value) => {
    if (value === undefined || value === null || value === "") return null
    const raw = String(value).trim().toLowerCase()
    if (raw === "true" || raw === "1" || raw === "yes") return true
    if (raw === "false" || raw === "0" || raw === "no") return false
    return null
}

export const buildPhotographerListFilter = (query = {}) => {
    const filter = {}

    const onboarded = parseBooleanQuery(
        query.onboarded ?? query.onboardingComplete
    )
    if (onboarded === true) {
        filter.onboardingCompletedAt = { $ne: null }
    } else if (onboarded === false) {
        filter.onboardingCompletedAt = null
    }

    const emailVerified = parseBooleanQuery(query.emailVerified)
    if (emailVerified === true) {
        filter.emailVerifiedAt = { $ne: null }
    } else if (emailVerified === false) {
        filter.emailVerifiedAt = null
    }

    const isActive = parseBooleanQuery(query.isActive ?? query.active)
    if (isActive === true) {
        filter.isActive = true
    } else if (isActive === false) {
        filter.isActive = false
    }

    const planId = String(query.planId ?? query.plan ?? "").trim()
    if (planId) {
        filter["subscription.planId"] = planId
    }

    const subscriptionStatus = String(
        query.subscriptionStatus ?? query["subscription.status"] ?? ""
    ).trim()
    if (subscriptionStatus) {
        filter["subscription.status"] = subscriptionStatus
    }

    const smsSenderStatus = String(query.smsSenderStatus ?? "").trim()
    if (smsSenderStatus) {
        filter["studio.smsSenderStatus"] = smsSenderStatus
    }

    const authProvider = String(query.authProvider ?? "").trim()
    if (authProvider) {
        filter.authProvider = authProvider
    }

    return {
        ...filter,
        ...buildPhotographerSearchFilter(query.search ?? query.q),
    }
}

export const parsePhotographerSort = (query = {}) => {
    const raw = String(query.sort ?? query.orderBy ?? "createdAt")
        .trim()
        .toLowerCase()

    const allowed = {
        createdat: "createdAt",
        updatedat: "updatedAt",
        email: "email",
        onboardedat: "onboardingCompletedAt",
        companyname: "studio.companyName",
        lastloginat: "lastLoginAt",
        lastseenat: "lastSeenAt",
        logincount: "loginCount",
    }

    const field = allowed[raw.replace(/[^a-z]/g, "")] ?? "createdAt"

    const orderRaw = String(query.order ?? query.direction ?? "desc")
        .trim()
        .toLowerCase()
    const order = orderRaw === "asc" ? 1 : -1

    return { [field]: order }
}

export const formatAdminPhotographerListRow = (user, sessionMeta = {}) => {
    const studio = user.studio ?? {}
    const subscription = user.subscription ?? {}
    const planId = subscription.planId?.trim() || "free"
    const plan = getPlanById(planId) ?? getPlanById("free")
    const shaped = formatUserResponse(user)

    return {
        userId: user._id,
        accountId: user.accountId?.trim() || null,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        authProvider: user.authProvider ?? "email",
        isActive: user.isActive !== false,
        agreedToTermsAt: user.agreedToTermsAt ?? null,
        onboardingComplete: shaped.onboardingComplete,
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        companyName: studio.companyName?.trim() || "",
        companySlug: studio.companySlug?.trim() || "",
        country: studio.country?.trim() || "",
        phone: studio.phone?.trim() || "",
        primaryDeliverable: studio.primaryDeliverable?.trim() || "",
        smsSenderId: studio.smsSenderId?.trim() || "",
        smsSenderStatus: studio.smsSenderStatus || "none",
        planId: plan.id,
        planName: plan.name,
        subscriptionStatus: subscription.status ?? "free",
        activity: {
            lastLoginAt: user.lastLoginAt ?? null,
            lastSeenAt: user.lastSeenAt ?? null,
            loginCount: user.loginCount ?? 0,
            activeSessions: sessionMeta.activeSessions ?? 0,
            latestSession: sessionMeta.latestSession ?? null,
        },
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    }
}

export const formatAdminPhotographerDetail = ({
    user,
    clientCount = 0,
    galleryCounts = null,
    storageBreakdown = null,
    activeSessions = 0,
    recentSessions = [],
}) => {
    const shaped = formatUserResponse(user)
    const billing = formatBillingSubscriptionResponse(user)
    const plan = getPlanById(billing.planId) ?? getPlanById("free")
    const storageBytes = storageBreakdown?.totalBytes ?? 0

    return {
        ...shaped,
        onboardingCompletedAt: user.onboardingCompletedAt ?? null,
        agreedToTermsAt: user.agreedToTermsAt ?? null,
        activity: {
            lastLoginAt: user.lastLoginAt ?? null,
            lastSeenAt: user.lastSeenAt ?? null,
            loginCount: user.loginCount ?? 0,
            activeSessions,
            tokenVersion: user.tokenVersion ?? 0,
        },
        subscription: {
            ...billing,
            paystackCustomerCode:
                user.subscription?.paystackCustomerCode?.trim() || null,
        },
        usage: {
            clientCount,
            galleries: galleryCounts,
            storageBytes,
            storageLabel: formatBytesLabel(storageBytes),
            storageLimitBytes: plan.storageLimitBytes,
            storageLimitLabel: formatBytesLabel(plan.storageLimitBytes),
        },
        recentSessions,
    }
}
