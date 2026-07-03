import {
    formatStudioUrlFields,
    resolveMediaUrl,
    resolveStudioLogoSrc,
    resolveUserAvatarSrc,
} from "./formatUserResponse.js"
import {
    computePercentOfPlan,
    getPlanSummary,
} from "./storageFields.js"
import { formatWatermarkResponse } from "./watermarkFields.js"
import { formatGalleryDefaultsResponse } from "./galleryDefaultsFields.js"
import { formatEmailNotificationsResponse } from "./emailNotificationFields.js"

const formatMemberSince = (createdAt) => {
    if (!createdAt) return null
    const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
    if (Number.isNaN(date.getTime())) return null

    const formatted = date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    })

    return {
        date: date.toISOString(),
        label: formatted,
    }
}

export const isProfileComplete = (user) => {
    const studio = user.studio ?? {}
    const companyName = studio.companyName?.trim() || ""
    const phone = studio.phone?.trim() || ""
    const companySlug = studio.companySlug?.trim() || ""
    const primaryDeliverable = studio.primaryDeliverable?.trim() || ""
    const country = studio.country?.trim() || ""

    return Boolean(
        user.onboardingCompletedAt &&
            companyName &&
            phone &&
            companySlug &&
            primaryDeliverable &&
            country
    )
}

export const formatSettingsResponse = ({
    user,
    galleryCount = 0,
    storageUsedBytes = 0,
}) => {
    const doc = user.toJSON ? user.toJSON() : user
    const studio = doc.studio ?? {}
    const companyName = studio.companyName?.trim() || ""
    const phone = studio.phone?.trim() || ""
    const companySlug = studio.companySlug?.trim() || ""
    const website = studio.website?.trim() || ""
    const logoSrc = resolveStudioLogoSrc(studio)
    const avatarSrc = resolveUserAvatarSrc(doc)
    const urlFields = formatStudioUrlFields(studio)
    const plan = getPlanSummary(user)
    const profileComplete = isProfileComplete(doc)
    const memberSince = formatMemberSince(doc.createdAt)

    return {
        profile: {
            displayName: companyName || doc.email,
            email: doc.email,
            avatarSrc: avatarSrc ?? logoSrc ?? null,
            planName: plan.planLabel,
            planId: plan.planId,
            profileComplete,
            profileStatusLabel: profileComplete
                ? "Profile complete"
                : "Profile incomplete",
        },
        overview: {
            galleries: {
                used: galleryCount,
                limit: null,
                label: String(galleryCount),
            },
            planStorage: {
                limitBytes: plan.storageLimitBytes,
                usedBytes: storageUsedBytes,
                label: plan.storageLabel,
                percentOfPlan: computePercentOfPlan(
                    storageUsedBytes,
                    plan.storageLimitBytes
                ),
            },
            memberSince,
        },
        studio: {
            businessName: companyName,
            companyName,
            phone: phone || null,
            website: website || null,
            logoSrc: logoSrc ?? null,
            logoUrl: studio.logoUrl?.trim()
                ? resolveMediaUrl(studio.logoUrl)
                : null,
            ...urlFields,
        },
        account: {
            email: doc.email,
            role: doc.role?.trim() || "Photographer",
            accountId: doc.accountId?.trim() || null,
        },
        notifications: {
            email: formatEmailNotificationsResponse(doc),
        },
        watermark: formatWatermarkResponse(doc),
        galleryDefaults: formatGalleryDefaultsResponse(doc),
    }
}
