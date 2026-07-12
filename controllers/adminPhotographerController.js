import mongoose from "mongoose"
import User from "../models/User.js"
import Client from "../models/Client.js"
import UserSession from "../models/UserSession.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import { attachGalleryCounts } from "../utils/galleryFields.js"
import { getOwnerStorageBreakdown } from "../utils/storageUsage.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import {
    buildPhotographerListFilter,
    formatAdminPhotographerDetail,
    formatAdminPhotographerListRow,
    parsePhotographerSort,
} from "../utils/adminPhotographerFields.js"
import {
    endAllUserSessions,
    formatAdminUserSession,
    loadActiveSessionCounts,
    loadLatestSessionsByUser,
} from "../utils/userSessions.js"

const findPhotographer = async (userId) => {
    if (!mongoose.isValidObjectId(userId)) {
        return { error: { status: 400, message: "Invalid user id" } }
    }

    const user = await User.findById(userId)
    if (!user) {
        return { error: { status: 404, message: "Photographer not found" } }
    }

    return { user }
}

const setPhotographerActiveStatus = async (user, nextActive) => {
    if (user.isActive === nextActive) {
        return false
    }

    user.isActive = nextActive
    if (!nextActive) {
        await endAllUserSessions(user._id, "revoked")
        user.tokenVersion = (user.tokenVersion ?? 0) + 1
    }

    await user.save()
    return true
}

export const listPhotographers = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = buildPhotographerListFilter(req.query)
        const sort = parsePhotographerSort(req.query)

        const [total, users] = await Promise.all([
            User.countDocuments(filter),
            paginatedQuery(
                User.find(filter)
                    .select(
                        "email accountId authProvider isActive agreedToTermsAt emailVerifiedAt onboardingCompletedAt lastLoginAt lastSeenAt loginCount studio subscription createdAt updatedAt"
                    )
                    .sort(sort),
                pagination
            ).exec(),
        ])

        const userIds = users.map((user) => user._id)
        const [activeSessionCounts, latestSessions] = await Promise.all([
            loadActiveSessionCounts(userIds),
            loadLatestSessionsByUser(userIds),
        ])

        return res.status(200).json({
            items: users.map((user) => {
                const userKey = String(user._id)
                return formatAdminPhotographerListRow(user, {
                    activeSessions: activeSessionCounts.get(userKey) ?? 0,
                    latestSession: latestSessions.get(userKey) ?? null,
                })
            }),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listPhotographers:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getPhotographer = async (req, res) => {
    try {
        const { user, error } = await findPhotographer(req.params.userId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const sessionLimit = Math.min(
            Number(req.query.sessionLimit ?? req.query.recentSessions ?? 10) || 10,
            50
        )

        const [
            clientCount,
            galleryCounts,
            storageBreakdown,
            activeSessions,
            recentSessions,
        ] = await Promise.all([
            Client.countDocuments({ owner: user._id }),
            attachGalleryCounts(user._id),
            getOwnerStorageBreakdown(user._id),
            UserSession.countDocuments({
                user: user._id,
                loggedOutAt: null,
                expiresAt: { $gt: new Date() },
            }),
            UserSession.find({ user: user._id })
                .sort({ loggedInAt: -1 })
                .limit(sessionLimit)
                .lean(),
        ])

        return res.status(200).json({
            photographer: formatAdminPhotographerDetail({
                user,
                clientCount,
                galleryCounts,
                storageBreakdown,
                activeSessions,
                recentSessions: recentSessions.map(formatAdminUserSession),
            }),
        })
    } catch (error) {
        console.error("getPhotographer:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listPhotographerSessions = async (req, res) => {
    try {
        const { user, error } = await findPhotographer(req.params.userId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = { user: user._id }

        const activeOnly = String(req.query.active ?? "").trim().toLowerCase()
        if (activeOnly === "true" || activeOnly === "1") {
            filter.loggedOutAt = null
            filter.expiresAt = { $gt: new Date() }
        }

        const [total, sessions] = await Promise.all([
            UserSession.countDocuments(filter),
            paginatedQuery(
                UserSession.find(filter).sort({ loggedInAt: -1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            userId: user._id,
            accountId: user.accountId?.trim() || null,
            email: user.email,
            items: sessions.map(formatAdminUserSession),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listPhotographerSessions:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updatePhotographer = async (req, res) => {
    try {
        const { user, error } = await findPhotographer(req.params.userId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const body = req.body ?? {}
        let changed = false

        if (body.isActive !== undefined) {
            changed = await setPhotographerActiveStatus(
                user,
                Boolean(body.isActive)
            )
        }

        if (!changed) {
            return res.status(400).json({
                message: "No supported fields to update (isActive)",
            })
        }

        return res.status(200).json({
            message: "Photographer updated",
            user: formatUserResponse(user),
        })
    } catch (error) {
        console.error("updatePhotographer:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const activatePhotographer = async (req, res) => {
    try {
        const { user, error } = await findPhotographer(req.params.userId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        await setPhotographerActiveStatus(user, true)

        return res.status(200).json({
            message: "Photographer activated",
            user: formatUserResponse(user),
        })
    } catch (error) {
        console.error("activatePhotographer:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deactivatePhotographer = async (req, res) => {
    try {
        const { user, error } = await findPhotographer(req.params.userId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        await setPhotographerActiveStatus(user, false)

        return res.status(200).json({
            message: "Photographer deactivated",
            user: formatUserResponse(user),
        })
    } catch (error) {
        console.error("deactivatePhotographer:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const verifyPhotographerEmail = async (req, res) => {
    try {
        const { user, error } = await findPhotographer(req.params.userId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        if (!user.emailVerifiedAt) {
            user.emailVerifiedAt = new Date()
            user.emailVerificationOtpHash = undefined
            user.emailVerificationExpires = undefined
            user.emailVerificationSentAt = undefined
            await user.save()
        }

        return res.status(200).json({
            message: "Email marked as verified",
            user: formatUserResponse(user),
        })
    } catch (error) {
        console.error("verifyPhotographerEmail:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
