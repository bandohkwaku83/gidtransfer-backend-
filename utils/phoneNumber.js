/** Normalize a phone number to Arkesel's `233XXXXXXXXX` format when possible. */
export const normalizePhoneForSms = (value) => {
    if (value === undefined || value === null) return null

    let digits = String(value).trim().replace(/[^\d+]/g, "")
    if (!digits) return null

    if (digits.startsWith("+")) {
        digits = digits.slice(1)
    }

    if (digits.startsWith("00")) {
        digits = digits.slice(2)
    }

    if (digits.startsWith("0") && digits.length >= 10) {
        digits = `233${digits.slice(1)}`
    }

    if (!/^\d{10,15}$/.test(digits)) {
        return null
    }

    return digits
}
