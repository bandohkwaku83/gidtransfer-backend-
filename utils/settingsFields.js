import { parseLogoDataUrl } from "./studioFields.js"
import { validateSmsSenderId } from "./smsSenderId.js"
import { parseEmailNotificationInput } from "./emailNotificationFields.js"
import { MAX_AVATAR_BYTES } from "./userAvatarStorage.js"

const LOGO_DATA_URL_REGEX = /^data:image\/(png|jpe?g);base64,/i

export const parseAvatarDataUrl = (value) => {
    if (value === undefined || value === null || value === "") {
        return { value: undefined }
    }
    if (typeof value !== "string") {
        return { error: "Profile photo must be a valid image" }
    }
    const trimmed = value.trim()
    if (!LOGO_DATA_URL_REGEX.test(trimmed)) {
        return { error: "Profile photo must be PNG or JPG" }
    }
    const base64 = trimmed.split(",")[1]
    if (!base64) {
        return { error: "Profile photo must be a valid image" }
    }
    const sizeBytes = Buffer.byteLength(base64, "base64")
    if (sizeBytes > MAX_AVATAR_BYTES) {
        return { error: "Profile photo must be 1.2 MB or smaller" }
    }
    return { value: trimmed }
}

const WEBSITE_REGEX =
    /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w\-._~:/?#[\]@!$&'()*+,;=%]*)?$/i

export const parseWebsite = (value) => {
    if (value === undefined || value === null) {
        return { value: undefined }
    }
    const trimmed = String(value).trim()
    if (!trimmed) {
        return { value: "" }
    }
    if (!WEBSITE_REGEX.test(trimmed)) {
        return { error: "Website must be a valid URL" }
    }
    const normalized = /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`
    return { value: normalized }
}

export const parseSettingsInput = (body, { partial = true } = {}) => {
    const companyName = (
        body.companyName ??
        body.studioName ??
        body.businessName ??
        body.studio_name ??
        ""
    ).trim()
    const phone = (
        body.phone ??
        body.businessPhone ??
        body.businessNumber ??
        body.business_phone ??
        ""
    ).trim()
    const companySlugRaw =
        body.companySlug ?? body.company_slug ?? body.studioUrlSlug ?? body.urlSlug
    const websiteRaw = body.website ?? body.websiteUrl ?? body.website_url
    const smsSenderIdRaw =
        body.smsSenderId ??
        body.sms_sender_id ??
        body.smsDisplayName ??
        body.sms_display_name
    const logoRaw = body.logoDataUrl ?? body.logo_data_url
    const avatarRaw = body.avatarDataUrl ?? body.avatar_data_url
    const errors = []
    const fields = {}

    if (companyName !== undefined && (companyName || !partial)) {
        if (!companyName && !partial) {
            errors.push("Business name is required")
        } else if (companyName) {
            fields.companyName = companyName
        } else if (partial && body.companyName !== undefined) {
            errors.push("Business name is required")
        }
    }

    if (companySlugRaw !== undefined && companySlugRaw !== null) {
        const slug = String(companySlugRaw).trim()
        if (!slug && !partial) {
            errors.push("Studio URL slug is required")
        } else if (slug) {
            fields.companySlug = slug
        } else if (partial) {
            errors.push("Studio URL slug is required")
        }
    }

    if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
        fields.phone = phone
    } else if (
        body.phone !== undefined ||
        body.businessPhone !== undefined ||
        body.businessNumber !== undefined
    ) {
        fields.phone = phone
    }

    if (websiteRaw !== undefined) {
        const websiteResult = parseWebsite(websiteRaw)
        if (websiteResult.error) {
            errors.push(websiteResult.error)
        } else {
            fields.website = websiteResult.value
        }
    }

    if (smsSenderIdRaw !== undefined && smsSenderIdRaw !== null) {
        const validation = validateSmsSenderId(smsSenderIdRaw)
        if (validation.error) {
            errors.push(validation.error)
        } else {
            fields.smsSenderId = validation.value
        }
    }

    if (logoRaw !== undefined && logoRaw !== null && logoRaw !== "") {
        const logoResult = parseLogoDataUrl(logoRaw)
        if (logoResult.error) {
            errors.push(logoResult.error)
        } else if (logoResult.value) {
            fields.logoDataUrl = logoResult.value
        }
    } else if (body.clearLogo === true || body.clearLogo === "true") {
        fields.logoDataUrl = ""
        fields.clearLogo = true
    }

    if (avatarRaw !== undefined && avatarRaw !== null && avatarRaw !== "") {
        const avatarResult = parseAvatarDataUrl(avatarRaw)
        if (avatarResult.error) {
            errors.push(avatarResult.error)
        } else if (avatarResult.value) {
            fields.avatarDataUrl = avatarResult.value
        }
    } else if (body.clearAvatar === true || body.clearAvatar === "true") {
        fields.avatarDataUrl = ""
        fields.clearAvatar = true
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    const notificationResult = parseEmailNotificationInput(body, { partial })
    if (notificationResult.errors.length) {
        errors.push(...notificationResult.errors)
    }
    if (notificationResult.fields.emailNotifications) {
        fields.emailNotifications = notificationResult.fields.emailNotifications
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    return { fields, errors: [] }
}
