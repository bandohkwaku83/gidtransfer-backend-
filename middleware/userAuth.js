import jwt from "jsonwebtoken"
import mongoose from "mongoose"
import User from "../models/User.js"
import { isTokenVersionValid } from "../utils/authToken.js"
import {
    emailVerificationExempt,
    isEmailVerified,
} from "../utils/emailVerification.js"

const bearerToken = (authHeader) => {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null
    const token = authHeader.slice(7).trim()
    if (!token || token === "undefined" || token === "null") return null
    return token
}

export const protectUser = async (req, res, next) => {
    try {
        const secret = process.env.JWT_SECRET?.trim()
        if (!secret) {
            return res.status(503).json({ message: "Auth is not configured on the server" })
        }

        const token = bearerToken(req.headers.authorization)
        if (!token) {
            return res
                .status(401)
                .json({ message: "Not authorized, token missing" })
        }

        let decoded
        try {
            decoded = jwt.verify(token, secret)
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({
                    message: "Session expired. Please log in again.",
                })
            }
            if (process.env.NODE_ENV !== "production") {
                console.error("[auth] JWT verify failed:", err.message)
            }
            return res.status(401).json({
                message:
                    "Not authorized, token invalid. Log in again on this same API (local: http://127.0.0.1:7100).",
            })
        }

        const userId = decoded?.id ? String(decoded.id) : ""
        if (!userId || !mongoose.isValidObjectId(userId)) {
            return res.status(401).json({ message: "Not authorized, token invalid" })
        }

        const user = await User.findById(userId)
        if (!user || !user.isActive) {
            return res.status(401).json({ message: "Account no longer exists" })
        }

        if (!isTokenVersionValid(decoded, user)) {
            return res.status(401).json({
                message: "Session ended. Please log in again.",
            })
        }

        if (!isEmailVerified(user) && !emailVerificationExempt(req)) {
            return res.status(403).json({
                message: "Email verification required",
                code: "EMAIL_NOT_VERIFIED",
            })
        }

        req.user = user
        next()
    } catch (err) {
        console.error("[auth] protectUser error:", err)
        return res.status(401).json({ message: "Not authorized, token invalid" })
    }
}
