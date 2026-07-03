import {
    MAX_LOGO_BYTES,
    MAX_LOGO_DATA_URL_LENGTH,
    logoSizeErrorMessage,
} from "./studioLogoStorage.js"
import { validateSmsSenderId } from "./smsSenderId.js"

const LOGO_DATA_URL_REGEX = /^data:image\/(png|jpe?g);base64,/i

export const parseStudioInput = (body, { partial = false } = {}) => {
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
    const primaryDeliverable = (
        body.primaryDeliverable ??
        body.primaryDelivery ??
        body.primary_delivery ??
        body.deliveryType ??
        ""
    ).trim()
    const country = (body.country ?? "").trim()
    const referralCode = (body.referralCode ?? body.referral_code ?? "").trim()
    const smsSenderIdRaw =
        body.smsSenderId ??
        body.sms_sender_id ??
        body.smsDisplayName ??
        body.sms_display_name
    const logoRaw = body.logoDataUrl ?? body.logo_data_url
    const errors = []
    const fields = {}

    if (companyName !== undefined || !partial) {
        if (!companyName) {
            if (!partial) errors.push("Studio / company name is required")
        } else {
            fields.companyName = companyName
        }
    }

    if (phone !== undefined || !partial) {
        if (!phone) {
            if (!partial) errors.push("Business phone is required")
        } else {
            fields.phone = phone
        }
    }

    if (companySlugRaw !== undefined && companySlugRaw !== null) {
        const slug = String(companySlugRaw).trim()
        if (!slug && !partial) {
            errors.push("Studio URL slug is required")
        } else if (slug) {
            fields.companySlug = slug
        }
    } else if (!partial) {
        errors.push("Studio URL slug is required")
    }

    if (primaryDeliverable !== undefined || !partial) {
        if (!primaryDeliverable) {
            if (!partial) errors.push("Primary deliverable is required")
        } else {
            fields.primaryDeliverable = primaryDeliverable
        }
    }

    if (country !== undefined || !partial) {
        if (!country) {
            if (!partial) errors.push("Country is required")
        } else {
            fields.country = country
        }
    }

    if (referralCode) {
        fields.referralCode = referralCode
    } else if (body.referralCode === "" || body.referral_code === "") {
        fields.referralCode = ""
    }

    if (smsSenderIdRaw !== undefined && smsSenderIdRaw !== null) {
        const validation = validateSmsSenderId(smsSenderIdRaw)
        if (validation.error) {
            errors.push(validation.error)
        } else {
            fields.smsSenderId = validation.value
        }
    } else if (!partial) {
        errors.push("SMS display name is required")
    }

    if (logoRaw !== undefined && logoRaw !== null && logoRaw !== "") {
        const logoResult = parseLogoDataUrl(logoRaw)
        if (logoResult.error) {
            errors.push(logoResult.error)
        } else if (logoResult.value) {
            fields.logoDataUrl = logoResult.value
        }
    } else if (body.clearLogo === true) {
        fields.logoDataUrl = ""
        fields.clearLogo = true
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    return { fields, errors: [] }
}

export const parseLogoDataUrl = (value) => {
    if (value === undefined || value === null || value === "") {
        return { value: undefined }
    }
    if (typeof value !== "string") {
        return { error: "Logo must be a valid image" }
    }
    const trimmed = value.trim()
    if (trimmed.length > MAX_LOGO_DATA_URL_LENGTH) {
        return { error: logoSizeErrorMessage() }
    }
    if (!LOGO_DATA_URL_REGEX.test(trimmed)) {
        return { error: "Logo must be PNG or JPG" }
    }
    const base64 = trimmed.split(",")[1]
    if (!base64) {
        return { error: "Logo must be a valid image" }
    }
    const sizeBytes = Buffer.byteLength(base64, "base64")
    if (sizeBytes > MAX_LOGO_BYTES) {
        return { error: logoSizeErrorMessage() }
    }
    return { value: trimmed }
}
