import crypto from "crypto"

export const COLLAB_INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const createCollaborationInviteToken = () => {
    const raw = crypto.randomBytes(32).toString("hex")
    const hash = crypto.createHash("sha256").update(raw).digest("hex")
    return { raw, hash }
}

export const hashCollaborationInviteToken = (raw) =>
    crypto.createHash("sha256").update(String(raw ?? "")).digest("hex")

export const inviteExpiresAt = (from = new Date()) =>
    new Date(from.getTime() + COLLAB_INVITE_EXPIRY_MS)
