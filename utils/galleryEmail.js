const EMAIL_RE =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

export function normalizeEmail(value) {
    if (value == null) return ""
    return String(value).trim().toLowerCase()
}

export function isValidEmail(value) {
    const email = normalizeEmail(value)
    if (!email || email.length > 320) return false
    return EMAIL_RE.test(email)
}
