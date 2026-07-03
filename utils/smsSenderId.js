export const SMS_SENDER_ID_MAX_LENGTH = 11

export const SMS_SENDER_STATUSES = ["none", "pending", "approved", "rejected"]

const SMS_SENDER_ID_REGEX = /^[A-Za-z0-9]+$/

export const normalizeSmsSenderId = (value) => {
    if (value === undefined || value === null) return ""
    return String(value).trim().toUpperCase().replace(/\s+/g, "")
}

export const validateSmsSenderId = (value) => {
    const normalized = normalizeSmsSenderId(value)
    if (!normalized) {
        return { error: "SMS display name is required" }
    }
    if (normalized.length > SMS_SENDER_ID_MAX_LENGTH) {
        return {
            error: `SMS display name must be ${SMS_SENDER_ID_MAX_LENGTH} characters or fewer`,
        }
    }
    if (!SMS_SENDER_ID_REGEX.test(normalized)) {
        return {
            error: "SMS display name may only contain letters and numbers",
        }
    }
    return { value: normalized }
}

/** Suggest an Arkesel-compatible sender ID from a studio / company name. */
export const suggestSmsSenderIdFromCompanyName = (companyName) => {
    const compact = String(companyName ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")

    if (!compact) return ""
    return compact.slice(0, SMS_SENDER_ID_MAX_LENGTH)
}
