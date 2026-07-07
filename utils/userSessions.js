import mongoose from "mongoose"
import User from "../models/User.js"
import UserSession from "../models/UserSession.js"
import { generateUserToken, tokenVersionFromUser } from "./authToken.js"

const JWT_EXPIRY_MS = {
    d: 86_400_000,
    h: 3_600_000,
    m: 60_000,
    s: 1_000,
}

export const parseJwtExpiresInMs = (value = "7d") => {
    const match = String(value).trim().match(/^(\d+)([dhms])$/i)
    if (!match) return 7 * JWT_EXPIRY_MS.d
    const amount = Number(match[1])
    const unit = match[2].toLowerCase()
    return amount * (JWT_EXPIRY_MS[unit] ?? JWT_EXPIRY_MS.d)
}

export const clientMetaFromReq = (req) => ({
    ipAddress:
        req?.ip ||
        String(req?.headers?.["x-forwarded-for"] ?? "")
            .split(",")[0]
            ?.trim() ||
        "",
    userAgent: String(req?.headers?.["user-agent"] ?? "").trim(),
})

export const beginUserSession = async (user, { req, authMethod }) => {
    const now = new Date()
    const expiresAt = new Date(
        now.getTime() + parseJwtExpiresInMs(process.env.JWT_EXPIRES_IN || "7d")
    )
    const userId = user._id ?? user.id

    const session = await UserSession.create({
        user: userId,
        tokenVersion: tokenVersionFromUser(user),
        authMethod,
        ...clientMetaFromReq(req),
        loggedInAt: now,
        lastSeenAt: now,
        expiresAt,
    })

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        {
            $set: {
                lastLoginAt: now,
                lastSeenAt: now,
            },
            $inc: {
                loginCount: 1,
            },
        },
        { returnDocument: "after" }
    )

    if (!updatedUser) {
        throw new Error("User not found while recording login session")
    }

    return { session, user: updatedUser }
}

export const issueAuthenticatedSession = async (user, { req, authMethod }) => {
    const { session, user: updatedUser } = await beginUserSession(user, {
        req,
        authMethod,
    })
    const token = generateUserToken(updatedUser, session._id)
    return { token, session, user: updatedUser }
}

export const endAllUserSessions = async (userId, reason = "logout") => {
    await UserSession.updateMany(
        {
            user: userId,
            loggedOutAt: null,
        },
        {
            $set: {
                loggedOutAt: new Date(),
                logoutReason: reason,
            },
        }
    )
}

const touchThrottleMs = Number(process.env.SESSION_TOUCH_MS ?? 60_000)
const lastTouchByKey = new Map()

const shouldTouch = (key) => {
    const now = Date.now()
    const last = lastTouchByKey.get(key) ?? 0
    if (now - last < touchThrottleMs) return false
    lastTouchByKey.set(key, now)
    return true
}

/** Updates lastSeenAt for the user on every authenticated request (throttled). */
export const touchUserActivity = async (userId, sessionId = null) => {
    if (!userId) return

    const userKey = String(userId)
    const touchKey = sessionId ? `session:${sessionId}` : `user:${userKey}`
    if (!shouldTouch(touchKey)) return

    const seenAt = new Date()
    const updates = [
        User.updateOne({ _id: userId }, { $set: { lastSeenAt: seenAt } }),
    ]

    if (sessionId && mongoose.isValidObjectId(sessionId)) {
        updates.push(
            UserSession.updateOne(
                { _id: sessionId, user: userId, loggedOutAt: null },
                { $set: { lastSeenAt: seenAt } }
            )
        )
    }

    await Promise.all(updates)
}

export const isSessionActive = (session, now = new Date()) =>
    !session.loggedOutAt && session.expiresAt > now

export const formatAdminUserSession = (session) => {
    const doc = session.toJSON ? session.toJSON() : session
    const now = new Date()

    return {
        id: String(doc._id),
        authMethod: doc.authMethod,
        ipAddress: doc.ipAddress?.trim() || null,
        userAgent: doc.userAgent?.trim() || null,
        loggedInAt: doc.loggedInAt,
        lastSeenAt: doc.lastSeenAt,
        loggedOutAt: doc.loggedOutAt ?? null,
        logoutReason: doc.logoutReason ?? null,
        expiresAt: doc.expiresAt,
        active: isSessionActive(doc, now),
    }
}

export const loadActiveSessionCounts = async (userIds) => {
    if (!userIds.length) return new Map()

    const now = new Date()
    const rows = await UserSession.aggregate([
        {
            $match: {
                user: { $in: userIds },
                loggedOutAt: null,
                expiresAt: { $gt: now },
            },
        },
        {
            $group: {
                _id: "$user",
                count: { $sum: 1 },
            },
        },
    ])

    return new Map(rows.map((row) => [String(row._id), row.count]))
}

export const loadLatestSessionsByUser = async (userIds) => {
    if (!userIds.length) return new Map()

    const rows = await UserSession.aggregate([
        { $match: { user: { $in: userIds } } },
        { $sort: { loggedInAt: -1 } },
        {
            $group: {
                _id: "$user",
                session: { $first: "$$ROOT" },
            },
        },
    ])

    return new Map(
        rows.map((row) => [String(row._id), formatAdminUserSession(row.session)])
    )
}
