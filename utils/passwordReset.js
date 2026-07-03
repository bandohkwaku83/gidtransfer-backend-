import crypto from "crypto"

export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000 // 1 hour

export const createPasswordResetToken = () => {
    const raw = crypto.randomBytes(32).toString("hex")
    const hash = crypto.createHash("sha256").update(raw).digest("hex")
    return { raw, hash }
}

export const hashPasswordResetToken = (raw) =>
    crypto.createHash("sha256").update(raw).digest("hex")
