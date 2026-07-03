import jwt from "jsonwebtoken"

const GALLERY_ACCESS_EXPIRES_IN = process.env.GALLERY_ACCESS_EXPIRES_IN || "7d"

function jwtSecret() {
    const secret = process.env.JWT_SECRET
    if (!secret?.trim()) {
        throw new Error("JWT_SECRET is not configured")
    }
    return secret
}

export function decodeGalleryAccessToken(token, galleryId) {
    if (!token?.trim() || !galleryId) return null
    try {
        const decoded = jwt.verify(token.trim(), jwtSecret())
        if (
            decoded?.kind !== "gallery_access" ||
            String(decoded?.gid) !== String(galleryId)
        ) {
            return null
        }
        return decoded
    } catch {
        return null
    }
}

/** @deprecated Prefer issueGalleryAccessToken with explicit grants. */
export const generateGalleryAccessToken = (galleryId) => {
    return issueGalleryAccessToken(galleryId, null, { password: true, email: true })
}

export function issueGalleryAccessToken(galleryId, existingToken, grants = {}) {
    if (!galleryId) {
        throw new Error("Gallery id is required to generate an access token")
    }

    const existing = existingToken
        ? decodeGalleryAccessToken(existingToken, galleryId)
        : null

    const passwordUnlocked =
        grants.password === true || existing?.passwordUnlocked === true
    const emailVerified =
        grants.email === true || existing?.emailVerified === true

    return jwt.sign(
        {
            gid: String(galleryId),
            kind: "gallery_access",
            passwordUnlocked,
            emailVerified,
        },
        jwtSecret(),
        { expiresIn: GALLERY_ACCESS_EXPIRES_IN }
    )
}

export const verifyGalleryAccessToken = (token, galleryId) => {
    return Boolean(decodeGalleryAccessToken(token, galleryId))
}

export function hasGalleryPasswordToken(token, galleryId) {
    const decoded = decodeGalleryAccessToken(token, galleryId)
    if (!decoded) return false
    if (
        decoded.passwordUnlocked !== undefined ||
        decoded.emailVerified !== undefined
    ) {
        return decoded.passwordUnlocked === true
    }
    return true
}

export function hasGalleryEmailToken(token, galleryId) {
    const decoded = decodeGalleryAccessToken(token, galleryId)
    if (!decoded) return false
    if (
        decoded.passwordUnlocked !== undefined ||
        decoded.emailVerified !== undefined
    ) {
        return decoded.emailVerified === true
    }
    return false
}

function readCookie(req, name) {
    const raw = req.headers?.cookie
    if (!raw) return null
    const parts = raw.split(";")
    for (const part of parts) {
        const [key, ...rest] = part.trim().split("=")
        if (key === name) {
            const value = rest.join("=").trim()
            return value ? decodeURIComponent(value) : null
        }
    }
    return null
}

export const extractGalleryAccessToken = (req) => {
    const header =
        req.headers?.["x-gallery-access-token"] ??
        req.headers?.["x-gallery-access"]
    if (header?.trim()) return header.trim()

    const cookie = readCookie(req, "gallery_access")
    if (cookie?.trim()) return cookie.trim()

    const query = req.query?.accessToken ?? req.query?.access_token
    if (query?.trim()) return String(query).trim()

    const body = req.body?.accessToken ?? req.body?.access_token
    if (body?.trim()) return String(body).trim()

    return null
}

export const GALLERY_ACCESS_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export function setGalleryAccessCookie(res, token) {
    const secure = process.env.NODE_ENV === "production"
    res.cookie("gallery_access", token, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        maxAge: GALLERY_ACCESS_COOKIE_MAX_AGE_MS,
    })
}
