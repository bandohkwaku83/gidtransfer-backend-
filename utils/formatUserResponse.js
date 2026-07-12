import { suggestCompanySlugFromName } from "./gallerySlugHelpers.js"
import { studioUrlDisplay } from "./studioUrl.js"
import { formatSmsSenderFields } from "./studioSms.js"
import { formatEmailNotificationsResponse } from "./emailNotificationFields.js"

export const publicApiBase = () =>
    (process.env.API_PUBLIC_URL || `http://127.0.0.1:${process.env.PORT || 7100}`).replace(
        /\/$/,
        ""
    )

/** Turn relative upload paths into absolute URLs for client apps. */
export const resolveMediaUrl = (url) => {
    if (!url?.trim()) return null
    const trimmed = url.trim()
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed
    }
    return `${publicApiBase()}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`
}

export const resolveStudioLogoSrc = (studio) => {
    if (!studio) return undefined
    const logoUrl = studio.logoUrl?.trim()
    const logoDataUrl = studio.logoDataUrl?.trim()
    if (logoUrl) {
        return logoUrl.startsWith("http") ? logoUrl : `${publicApiBase()}${logoUrl}`
    }
    return logoDataUrl || undefined
}

export const resolveUserAvatarSrc = (user) => {
    if (!user) return undefined
    const avatarUrl = user.avatarUrl?.trim()
    const avatarDataUrl = user.avatarDataUrl?.trim()
    if (avatarUrl) {
        return avatarUrl.startsWith("http")
            ? avatarUrl
            : `${publicApiBase()}${avatarUrl}`
    }
    return avatarDataUrl || undefined
}

/** Studio branding for public client gallery responses. */
export const formatPublicStudioResponse = (studio, companySlug) => {
    const s = studio ?? {}
    const logoSrc = resolveStudioLogoSrc(s)
    const logoUrl = s.logoUrl?.trim() ? resolveMediaUrl(s.logoUrl) : undefined
    const slug = companySlug ?? s.companySlug?.trim() ?? null
    const urlParts = studioUrlDisplay(slug)

    return {
        companyName: s.companyName?.trim() ?? "",
        companySlug: slug,
        studioUrl: urlParts.studioUrl,
        /** Absolute URL or data URL for the company logo (hero/header). */
        companyLogo: logoSrc ?? null,
        logoSrc: logoSrc ?? null,
        ...(logoUrl ? { logoUrl } : {}),
    }
}

export const formatStudioUrlFields = (studio) => {
    const s = studio ?? {}
    const savedSlug = s.companySlug?.trim() || null
    const companyName = s.companyName?.trim() || ""
    const suggestedCompanySlug =
        savedSlug || (companyName ? suggestCompanySlugFromName(companyName) : null) || null
    const displaySlug = savedSlug || suggestedCompanySlug
    const urlParts = studioUrlDisplay(displaySlug)

    return {
        ...(savedSlug ? { companySlug: savedSlug } : {}),
        ...(suggestedCompanySlug ? { suggestedCompanySlug } : {}),
        ...urlParts,
    }
}

export const formatUserResponse = (user) => {
    const doc = user.toJSON ? user.toJSON() : user
    const studio = doc.studio ?? {}
    const companyName = studio.companyName?.trim() || ""
    const phone = studio.phone?.trim() || ""
    const primaryDeliverable = studio.primaryDeliverable?.trim() || ""
    const country = studio.country?.trim() || ""
    const referralCode = studio.referralCode?.trim() || ""
    const companySlug = studio.companySlug?.trim() || ""
    const website = studio.website?.trim() || ""
    const logoDataUrl = studio.logoDataUrl?.trim() || ""
    const logoUrl = studio.logoUrl?.trim() || ""
    const logoSrc = resolveStudioLogoSrc(studio)
    const avatarSrc = resolveUserAvatarSrc(doc)
    const urlFields = formatStudioUrlFields(studio)
    const smsFields = formatSmsSenderFields(studio)

    const shapedStudio =
        companyName ||
        phone ||
        primaryDeliverable ||
        country ||
        referralCode ||
        website ||
        logoDataUrl ||
        logoUrl ||
        companySlug ||
        studio.smsSenderId?.trim()
            ? {
                  ...(companyName ? { companyName } : {}),
                  ...urlFields,
                  ...smsFields,
                  ...(phone ? { phone } : {}),
                  ...(primaryDeliverable ? { primaryDeliverable } : {}),
                  ...(country ? { country } : {}),
                  ...(referralCode ? { referralCode } : {}),
                  ...(website ? { website } : {}),
                  ...(logoDataUrl ? { logoDataUrl } : {}),
                  ...(logoUrl ? { logoUrl } : {}),
                  ...(logoSrc ? { logoSrc, companyLogo: logoSrc } : {}),
              }
            : undefined

    const memberSince = doc.createdAt
        ? {
              date: new Date(doc.createdAt).toISOString(),
              label: new Date(doc.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
              }),
          }
        : null

    return {
        _id: doc._id,
        accountId: doc.accountId?.trim() || null,
        email: doc.email,
        emailVerified: Boolean(doc.emailVerifiedAt),
        emailVerifiedAt: doc.emailVerifiedAt ?? null,
        role: doc.role?.trim() || "Photographer",
        authProvider: doc.authProvider,
        agreedToTermsAt: doc.agreedToTermsAt,
        isActive: doc.isActive,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        memberSince,
        ...(avatarSrc ? { avatarSrc } : {}),
        emailNotifications: formatEmailNotificationsResponse(doc),
        onboardingComplete: Boolean(
            doc.onboardingCompletedAt &&
                companyName &&
                phone &&
                companySlug &&
                primaryDeliverable &&
                country &&
                studio.smsSenderId?.trim()
        ),
        studio: shapedStudio,
    }
}
