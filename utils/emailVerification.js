import crypto from "crypto"

export const EMAIL_VERIFICATION_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000 // 60 seconds

export const createEmailVerificationOtp = () => {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const hash = hashEmailVerificationOtp(code)
    return { code, hash }
}

export const hashEmailVerificationOtp = (code) =>
    crypto.createHash("sha256").update(String(code).trim()).digest("hex")

export const isEmailVerified = (user) =>
    Boolean(user?.emailVerifiedAt) || user?.authProvider !== "email"

const EMAIL_VERIFICATION_EXEMPT = [
    ["GET", "/api/auth/me"],
    ["POST", "/api/auth/verify-email"],
    ["POST", "/api/auth/resend-verification"],
    ["POST", "/api/auth/logout"],
    ["POST", "/api/auth/signout"],
]

export const emailVerificationExempt = (req) => {
    const method = req.method?.toUpperCase()
    const path = (req.originalUrl || req.url || req.path || "").split("?")[0]
    return EMAIL_VERIFICATION_EXEMPT.some(
        ([allowedMethod, allowedPath]) =>
            method === allowedMethod &&
            (path === allowedPath || path.endsWith(allowedPath))
    )
}

export const resendCooldownRemainingSeconds = (sentAt) => {
    if (!sentAt) return 0
    const elapsed = Date.now() - new Date(sentAt).getTime()
    const remaining = EMAIL_VERIFICATION_RESEND_COOLDOWN_MS - elapsed
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}
