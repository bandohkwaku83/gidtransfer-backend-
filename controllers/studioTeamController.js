import crypto from "crypto"
import mongoose from "mongoose"
import User from "../models/User.js"
import StudioMembership from "../models/StudioMembership.js"
import { nextAccountId } from "../utils/accountId.js"
import {
    countStudioSeats,
    formatMembershipResponse,
    isStudioOwnerAccount,
    studioMetaPayload,
} from "../utils/studioContext.js"
import {
    STUDIO_ROLE_KEYS,
    resolveMenuKeysForRole,
    sanitizeMenuKeys,
} from "../utils/studioMenus.js"
import { getEffectiveMaxTeamMembers } from "../utils/planCatalog.js"
import { sendFeatureDenied, userHasFeature } from "../utils/planFeatures.js"
import { sendStudioTeamWelcomeEmail } from "../utils/photographerNotifications.js"
import { photographerAppBase } from "../utils/appLinks.js"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 6

const normalizeEmail = (raw) => String(raw ?? "").trim().toLowerCase()

const generatePassword = () => crypto.randomBytes(9).toString("base64url").slice(0, 12)

const formatTeamMemberRow = (membership, userDoc = null) => {
    const base = formatMembershipResponse(membership)
    const u = userDoc || membership.user
    return {
        ...base,
        user:
            u && typeof u === "object" && u.email
                ? {
                      id: String(u._id),
                      email: u.email,
                      name:
                          membership.displayName?.trim() ||
                          u.studio?.companyName?.trim() ||
                          u.email?.split("@")[0] ||
                          "",
                      isActive: u.isActive !== false,
                  }
                : null,
    }
}

export const getStudioTeamMeta = async (_req, res) => {
    try {
        return res.status(200).json(studioMetaPayload())
    } catch (error) {
        console.error("getStudioTeamMeta:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listStudioTeam = async (req, res) => {
    try {
        if (!isStudioOwnerAccount(req)) {
            return res.status(403).json({
                message: "Only the studio owner can manage the team",
                code: "STUDIO_OWNER_REQUIRED",
            })
        }

        const rows = await StudioMembership.find({
            studioOwner: req.user._id,
            status: { $in: ["active", "disabled"] },
        })
            .populate("user", "email isActive studio.companyName")
            .sort({ createdAt: 1 })
            .exec()

        const max = getEffectiveMaxTeamMembers(req.user)
        const used = rows.filter((r) => r.status === "active").length

        return res.status(200).json({
            members: rows.map((row) => formatTeamMemberRow(row)),
            seats: { used, max },
            studioTeamAvailable: userHasFeature(req.user, "studioTeam"),
            ...studioMetaPayload(),
        })
    } catch (error) {
        console.error("listStudioTeam:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createStudioTeamMember = async (req, res) => {
    try {
        if (!isStudioOwnerAccount(req)) {
            return res.status(403).json({
                message: "Only the studio owner can manage the team",
                code: "STUDIO_OWNER_REQUIRED",
            })
        }

        if (!userHasFeature(req.user, "studioTeam")) {
            return sendFeatureDenied(res, "studioTeam", { user: req.user })
        }

        const email = normalizeEmail(req.body?.email)
        if (!email || !EMAIL_REGEX.test(email)) {
            return res.status(400).json({ message: "A valid email is required" })
        }

        if (email === String(req.user.email ?? "").toLowerCase()) {
            return res.status(400).json({ message: "You cannot add yourself as a team member" })
        }

        const role = String(req.body?.role ?? "editor").trim().toLowerCase()
        if (!STUDIO_ROLE_KEYS.includes(role)) {
            return res.status(400).json({
                message: `role must be one of: ${STUDIO_ROLE_KEYS.join(", ")}`,
            })
        }

        const menuKeys = resolveMenuKeysForRole(role, req.body?.menuKeys ?? null)
        if (!menuKeys) {
            return res.status(400).json({ message: "Invalid role" })
        }

        const displayName = String(req.body?.displayName ?? req.body?.name ?? "").trim()

        let password = String(req.body?.password ?? "")
        let generatedPassword = false
        if (!password) {
            password = generatePassword()
            generatedPassword = true
        } else if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            })
        }

        const existing = await User.findOne({ email }).exec()
        if (existing) {
            return res.status(409).json({
                message:
                    "An account with this email already exists. Studio team creates new users only.",
                code: "EMAIL_TAKEN",
            })
        }

        const max = getEffectiveMaxTeamMembers(req.user)
        const used = await countStudioSeats(req.user._id)
        if (max != null && max >= 0 && used >= max) {
            return res.status(403).json({
                message: `Team member limit reached (${max} on this plan).`,
                code: "TEAM_MEMBER_LIMIT_REACHED",
                maxTeamMembers: max,
            })
        }

        const accountId = await nextAccountId()
        const staffUser = await User.create({
            email,
            password,
            authProvider: "email",
            agreedToTermsAt: new Date(),
            emailVerifiedAt: new Date(),
            accountId,
            role: "Team member",
            onboardingCompletedAt: new Date(),
            studio: {
                companyName: displayName || email.split("@")[0],
            },
            subscription: {
                planId: "free",
                status: "free",
            },
        })

        const membership = await StudioMembership.create({
            studioOwner: req.user._id,
            user: staffUser._id,
            email,
            displayName,
            role,
            menuKeys,
            status: "active",
            createdBy: req.user._id,
        })

        const loginUrl = photographerAppBase(req.user.studio?.companySlug)
        const ownerStudio =
            req.user.studio?.companyName?.trim() ||
            req.user.email?.split("@")[0] ||
            "the studio"

        try {
            await sendStudioTeamWelcomeEmail({
                email,
                displayName: displayName || email.split("@")[0],
                ownerStudioName: ownerStudio,
                role,
                password: generatedPassword ? password : null,
                loginUrl,
            })
        } catch (err) {
            console.error("createStudioTeamMember email:", err)
        }

        await membership.populate("user", "email isActive studio.companyName")

        return res.status(201).json({
            message: "Team member created",
            member: formatTeamMemberRow(membership),
            temporaryPassword: generatedPassword ? password : undefined,
            seats: {
                used: used + 1,
                max,
            },
        })
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({
                message: "This user is already on a studio team",
            })
        }
        console.error("createStudioTeamMember:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateStudioTeamMember = async (req, res) => {
    try {
        if (!isStudioOwnerAccount(req)) {
            return res.status(403).json({
                message: "Only the studio owner can manage the team",
                code: "STUDIO_OWNER_REQUIRED",
            })
        }
        if (!userHasFeature(req.user, "studioTeam")) {
            return sendFeatureDenied(res, "studioTeam", { user: req.user })
        }

        const { memberId } = req.params
        if (!mongoose.isValidObjectId(memberId)) {
            return res.status(400).json({ message: "Invalid member id" })
        }

        const membership = await StudioMembership.findOne({
            _id: memberId,
            studioOwner: req.user._id,
        })
            .populate("user", "email isActive studio.companyName")
            .exec()

        if (!membership) {
            return res.status(404).json({ message: "Team member not found" })
        }

        if (req.body?.role !== undefined) {
            const role = String(req.body.role).trim().toLowerCase()
            if (!STUDIO_ROLE_KEYS.includes(role)) {
                return res.status(400).json({
                    message: `role must be one of: ${STUDIO_ROLE_KEYS.join(", ")}`,
                })
            }
            membership.role = role
            if (req.body?.menuKeys === undefined) {
                membership.menuKeys = resolveMenuKeysForRole(role)
            }
        }

        if (req.body?.menuKeys !== undefined) {
            const sanitized = sanitizeMenuKeys(req.body.menuKeys)
            if (!sanitized) {
                return res.status(400).json({ message: "menuKeys must be an array of menu keys" })
            }
            membership.menuKeys = sanitized
        }

        if (req.body?.displayName !== undefined || req.body?.name !== undefined) {
            membership.displayName = String(
                req.body.displayName ?? req.body.name ?? ""
            ).trim()
        }

        if (req.body?.status !== undefined) {
            const status = String(req.body.status).trim().toLowerCase()
            if (status !== "active" && status !== "disabled") {
                return res
                    .status(400)
                    .json({ message: "status must be active or disabled" })
            }
            if (status === "active" && membership.status !== "active") {
                const max = getEffectiveMaxTeamMembers(req.user)
                const used = await countStudioSeats(req.user._id)
                if (max != null && max >= 0 && used >= max) {
                    return res.status(403).json({
                        message: `Team member limit reached (${max} on this plan).`,
                        code: "TEAM_MEMBER_LIMIT_REACHED",
                        maxTeamMembers: max,
                    })
                }
                membership.status = "active"
                membership.disabledAt = null
                if (membership.user && membership.user.isActive === false) {
                    await User.updateOne(
                        { _id: membership.user._id },
                        { $set: { isActive: true } }
                    )
                }
            }
            if (status === "disabled") {
                membership.status = "disabled"
                membership.disabledAt = new Date()
            }
        }

        await membership.save()
        await membership.populate("user", "email isActive studio.companyName")

        return res.status(200).json({
            message: "Team member updated",
            member: formatTeamMemberRow(membership),
        })
    } catch (error) {
        console.error("updateStudioTeamMember:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const removeStudioTeamMember = async (req, res) => {
    try {
        if (!isStudioOwnerAccount(req)) {
            return res.status(403).json({
                message: "Only the studio owner can manage the team",
                code: "STUDIO_OWNER_REQUIRED",
            })
        }

        const { memberId } = req.params
        if (!mongoose.isValidObjectId(memberId)) {
            return res.status(400).json({ message: "Invalid member id" })
        }

        const membership = await StudioMembership.findOne({
            _id: memberId,
            studioOwner: req.user._id,
        }).exec()

        if (!membership) {
            return res.status(404).json({ message: "Team member not found" })
        }

        const staffUserId = membership.user
        await membership.deleteOne()

        // Soft-disable the staff login so the seat email can be reused later if needed.
        await User.updateOne(
            { _id: staffUserId },
            {
                $set: {
                    isActive: false,
                    tokenVersion: Date.now() % 1_000_000_000,
                },
            }
        )

        return res.status(200).json({ message: "Team member removed" })
    } catch (error) {
        console.error("removeStudioTeamMember:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const resetStudioTeamMemberPassword = async (req, res) => {
    try {
        if (!isStudioOwnerAccount(req)) {
            return res.status(403).json({
                message: "Only the studio owner can manage the team",
                code: "STUDIO_OWNER_REQUIRED",
            })
        }
        if (!userHasFeature(req.user, "studioTeam")) {
            return sendFeatureDenied(res, "studioTeam", { user: req.user })
        }

        const { memberId } = req.params
        if (!mongoose.isValidObjectId(memberId)) {
            return res.status(400).json({ message: "Invalid member id" })
        }

        const membership = await StudioMembership.findOne({
            _id: memberId,
            studioOwner: req.user._id,
            status: "active",
        }).exec()

        if (!membership) {
            return res.status(404).json({ message: "Team member not found" })
        }

        let password = String(req.body?.password ?? "")
        let generatedPassword = false
        if (!password) {
            password = generatePassword()
            generatedPassword = true
        } else if (password.length < MIN_PASSWORD_LENGTH) {
            return res.status(400).json({
                message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
            })
        }

        const staff = await User.findById(membership.user).select("+password").exec()
        if (!staff) {
            return res.status(404).json({ message: "Team member user not found" })
        }

        staff.password = password
        staff.tokenVersion = (staff.tokenVersion ?? 0) + 1
        await staff.save()

        return res.status(200).json({
            message: "Password updated",
            temporaryPassword: generatedPassword ? password : undefined,
        })
    } catch (error) {
        console.error("resetStudioTeamMemberPassword:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
