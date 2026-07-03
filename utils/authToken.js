import jwt from "jsonwebtoken"

export const tokenVersionFromUser = (user) => Number(user?.tokenVersion ?? 0)

export const generateUserToken = (user) => {
    const secret = process.env.JWT_SECRET
    if (!secret?.trim()) {
        throw new Error("JWT_SECRET is not configured")
    }

    const id = user?._id ?? user?.id
    if (!id) {
        throw new Error("User id is required to generate a token")
    }

    return jwt.sign(
        {
            id: String(id),
            kind: "user",
            tv: tokenVersionFromUser(user),
        },
        secret,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    )
}

/** False when the JWT was issued before the user's last logout. */
export const isTokenVersionValid = (decoded, user) =>
    Number(decoded?.tv ?? 0) === tokenVersionFromUser(user)
