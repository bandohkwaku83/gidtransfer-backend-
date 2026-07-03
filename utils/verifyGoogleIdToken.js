import { OAuth2Client } from "google-auth-library"

const getGoogleClientIds = () => {
    const raw = process.env.GOOGLE_CLIENT_ID || ""
    return raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
}

export const verifyGoogleIdToken = async (idToken) => {
    const clientIds = getGoogleClientIds()
    if (!clientIds.length) {
        const err = new Error("Google sign-in is not configured")
        err.code = "GOOGLE_NOT_CONFIGURED"
        throw err
    }

    const client = new OAuth2Client()
    const ticket = await client.verifyIdToken({
        idToken,
        audience: clientIds,
    })

    const payload = ticket.getPayload()
    if (!payload?.sub || !payload.email) {
        const err = new Error("Invalid Google token")
        err.code = "INVALID_GOOGLE_TOKEN"
        throw err
    }

    if (!payload.email_verified) {
        const err = new Error("Google account email is not verified")
        err.code = "EMAIL_NOT_VERIFIED"
        throw err
    }

    return {
        providerId: payload.sub,
        email: payload.email.toLowerCase().trim(),
    }
}
