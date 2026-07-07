import jwt from "jsonwebtoken"

export const tokenVersionFromUser = (user) => Number(user?.tokenVersion ?? 0)

export const generateUserToken = (user, sessionId = null) => {
    const secret = process.env.JWT_SECRET
    if (!secret?.trim()) {
        throw new Error("JWT_SECRET is not configured")
    }

    const id = user?._id ?? user?.id
    if (!id) {
        throw new Error("User id is required to generate a token")
    }

    const payload = {
        id: String(id),
        kind: "user",
        tv: tokenVersionFromUser(user),
    }
    if (sessionId) {
        payload.sid = String(sessionId)
    }

    return jwt.sign(payload, secret, {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    })
}

/** False when the JWT was issued before the user's last logout. */
export const isTokenVersionValid = (decoded, user) =>
    Number(decoded?.tv ?? 0) === tokenVersionFromUser(user)
