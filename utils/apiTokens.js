import crypto from "crypto"
import ApiToken from "../models/ApiToken.js"

export const API_TOKEN_PREFIX = "gt_live_"
export const MAX_API_TOKENS_PER_USER = 10
const LAST_USED_TOUCH_MS = 5 * 60 * 1000

export const isApiTokenString = (token) => {
    const value = String(token ?? "").trim()
    return value.startsWith(API_TOKEN_PREFIX) || value.startsWith("gt_test_")
}

export const hashApiToken = (token) =>
    crypto.createHash("sha256").update(String(token).trim()).digest("hex")

export const generateApiTokenSecret = () => {
    const secret = crypto.randomBytes(32).toString("hex")
    const token = `${API_TOKEN_PREFIX}${secret}`
    return {
        token,
        tokenHash: hashApiToken(token),
        tokenPrefix: token.slice(0, 16),
    }
}

export const formatApiTokenResponse = (doc) => {
    const row = doc.toJSON ? doc.toJSON() : doc
    return {
        id: String(row._id),
        name: row.name,
        tokenPrefix: row.tokenPrefix,
        lastUsedAt: row.lastUsedAt ?? null,
        createdAt: row.createdAt ?? null,
    }
}

export const countActiveApiTokens = (ownerId) =>
    ApiToken.countDocuments({ owner: ownerId, revokedAt: null })

export const findActiveApiTokenBySecret = async (token) => {
    const tokenHash = hashApiToken(token)
    return ApiToken.findOne({ tokenHash, revokedAt: null })
        .select("+tokenHash")
        .exec()
}

export const touchApiTokenUsage = async (tokenDoc) => {
    if (!tokenDoc?._id) return
    const last = tokenDoc.lastUsedAt ? new Date(tokenDoc.lastUsedAt).getTime() : 0
    if (Date.now() - last < LAST_USED_TOUCH_MS) return
    tokenDoc.lastUsedAt = new Date()
    await tokenDoc.save().catch(() => {})
}
