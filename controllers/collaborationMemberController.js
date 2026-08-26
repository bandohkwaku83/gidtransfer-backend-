import mongoose from "mongoose"
import CollaborationMember from "../models/CollaborationMember.js"
import CollaborationWorkspace from "../models/CollaborationWorkspace.js"
import User from "../models/User.js"
import {
    assertWorkspaceAccess,
    countWorkspaceSeats,
    loadWorkspaceOwnerUser,
    ownerCanManageCollaboration,
    seatLimitReached,
} from "../utils/collaborationAccess.js"
import {
    formatMemberResponse,
    formatWorkspaceResponse,
    normalizeMemberRole,
} from "../utils/collaborationFields.js"
import {
    createCollaborationInviteToken,
    hashCollaborationInviteToken,
    inviteExpiresAt,
} from "../utils/collaborationInvite.js"
import { sendCollaborationInviteEmail } from "../utils/photographerNotifications.js"
import { collaborationInviteUrl } from "../utils/appLinks.js"
import { getEffectiveMaxTeamMembers } from "../utils/planCatalog.js"
import { sendFeatureDenied } from "../utils/planFeatures.js"

const normalizeEmail = (raw) => String(raw ?? "").trim().toLowerCase()

const findInviteTargetUser = async (email) => {
    if (!email || !email.includes("@")) return null
    return User.findOne({ email, isActive: true })
        .select("_id email studio.companyName studio.companySlug")
        .exec()
}

export const listMembers = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "viewer"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const members = await CollaborationMember.find({
            workspace: access.workspace._id,
            status: { $in: ["invited", "active"] },
        })
            .populate("user", "email studio.companyName studio.companySlug")
            .sort({ createdAt: 1 })
            .exec()

        const owner = await loadWorkspaceOwnerUser(access.workspace.owner)
        const maxSeats = getEffectiveMaxTeamMembers(
            String(access.workspace.owner) === String(req.user._id)
                ? req.user
                : await User.findById(access.workspace.owner).lean()
        )

        return res.status(200).json({
            owner: owner
                ? {
                      id: String(owner._id),
                      email: owner.email,
                      name:
                          owner.studio?.companyName?.trim() ||
                          owner.email?.split("@")[0] ||
                          "",
                      role: "owner",
                  }
                : null,
            members: members.map(formatMemberResponse),
            seats: {
                used: members.length,
                max: maxSeats,
            },
        })
    } catch (error) {
        console.error("listMembers:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const inviteMember = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        if (!ownerCanManageCollaboration(req.user)) {
            return sendFeatureDenied(res, "collaboration", { user: req.user })
        }

        if (access.workspace.status === "archived") {
            return res
                .status(400)
                .json({ message: "Cannot invite members to an archived workspace" })
        }

        const email = normalizeEmail(req.body?.email)
        if (!email) {
            return res.status(400).json({ message: "email is required" })
        }

        const role = normalizeMemberRole(req.body?.role ?? "editor")
        if (!role) {
            return res
                .status(400)
                .json({ message: "role must be editor or viewer" })
        }

        const target = await findInviteTargetUser(email)
        if (!target) {
            return res.status(404).json({
                message:
                    "No Photo Global account found for this email. Ask them to register first, then invite again.",
                code: "USER_NOT_REGISTERED",
            })
        }

        if (String(target._id) === String(req.user._id)) {
            return res
                .status(400)
                .json({ message: "You cannot invite yourself" })
        }

        const existing = await CollaborationMember.findOne({
            workspace: access.workspace._id,
            user: target._id,
            status: { $in: ["invited", "active"] },
        }).exec()

        if (existing) {
            return res.status(409).json({
                message:
                    existing.status === "active"
                        ? "This user is already a member"
                        : "An invite is already pending for this user",
                member: formatMemberResponse(existing),
            })
        }

        if (await seatLimitReached(req.user, access.workspace._id)) {
            const max = getEffectiveMaxTeamMembers(req.user)
            return res.status(403).json({
                message: `Team member limit reached (${max} on this plan).`,
                code: "TEAM_MEMBER_LIMIT_REACHED",
                maxTeamMembers: max,
            })
        }

        // Re-activate a previously removed membership if present.
        let member = await CollaborationMember.findOne({
            workspace: access.workspace._id,
            user: target._id,
            status: "removed",
        }).exec()

        const { raw, hash } = createCollaborationInviteToken()
        const expires = inviteExpiresAt()

        if (member) {
            member.email = target.email
            member.role = role
            member.status = "invited"
            member.invitedBy = req.user._id
            member.inviteTokenHash = hash
            member.inviteExpiresAt = expires
            member.acceptedAt = null
            member.removedAt = null
            await member.save()
        } else {
            member = await CollaborationMember.create({
                workspace: access.workspace._id,
                user: target._id,
                email: target.email,
                role,
                status: "invited",
                invitedBy: req.user._id,
                inviteTokenHash: hash,
                inviteExpiresAt: expires,
            })
        }

        const ownerStudio =
            req.user.studio?.companyName?.trim() ||
            req.user.email?.split("@")[0] ||
            "A photographer"
        const acceptUrl = collaborationInviteUrl(
            raw,
            req.user.studio?.companySlug
        )

        try {
            await sendCollaborationInviteEmail({
                email: target.email,
                inviteeName:
                    target.studio?.companyName?.trim() ||
                    target.email.split("@")[0],
                ownerStudioName: ownerStudio,
                workspaceName: access.workspace.name,
                role,
                acceptUrl,
            })
        } catch (err) {
            console.error("inviteMember email:", err)
        }

        member = await CollaborationMember.findById(member._id)
            .populate("user", "email studio.companyName studio.companySlug")
            .exec()

        return res.status(201).json({
            message: "Invite sent",
            member: formatMemberResponse(member),
            seats: {
                used: await countWorkspaceSeats(access.workspace._id),
                max: getEffectiveMaxTeamMembers(req.user),
            },
        })
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({
                message: "This user is already invited or a member",
            })
        }
        console.error("inviteMember:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const resendInvite = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }
        if (!ownerCanManageCollaboration(req.user)) {
            return sendFeatureDenied(res, "collaboration", { user: req.user })
        }

        const { memberId } = req.params
        if (!mongoose.isValidObjectId(memberId)) {
            return res.status(400).json({ message: "Invalid member id" })
        }

        const member = await CollaborationMember.findOne({
            _id: memberId,
            workspace: access.workspace._id,
            status: "invited",
        })
            .populate("user", "email studio.companyName studio.companySlug")
            .exec()

        if (!member) {
            return res.status(404).json({ message: "Pending invite not found" })
        }

        const { raw, hash } = createCollaborationInviteToken()
        member.inviteTokenHash = hash
        member.inviteExpiresAt = inviteExpiresAt()
        await member.save()

        const ownerStudio =
            req.user.studio?.companyName?.trim() ||
            req.user.email?.split("@")[0] ||
            "A photographer"
        const acceptUrl = collaborationInviteUrl(
            raw,
            req.user.studio?.companySlug
        )

        try {
            await sendCollaborationInviteEmail({
                email: member.email,
                inviteeName:
                    member.user?.studio?.companyName?.trim() ||
                    member.email.split("@")[0],
                ownerStudioName: ownerStudio,
                workspaceName: access.workspace.name,
                role: member.role,
                acceptUrl,
            })
        } catch (err) {
            console.error("resendInvite email:", err)
        }

        return res.status(200).json({
            message: "Invite resent",
            member: formatMemberResponse(member),
        })
    } catch (error) {
        console.error("resendInvite:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateMemberRole = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }
        if (!ownerCanManageCollaboration(req.user)) {
            return sendFeatureDenied(res, "collaboration", { user: req.user })
        }

        const { memberId } = req.params
        if (!mongoose.isValidObjectId(memberId)) {
            return res.status(400).json({ message: "Invalid member id" })
        }

        const role = normalizeMemberRole(req.body?.role)
        if (!role) {
            return res
                .status(400)
                .json({ message: "role must be editor or viewer" })
        }

        const member = await CollaborationMember.findOne({
            _id: memberId,
            workspace: access.workspace._id,
            status: { $in: ["invited", "active"] },
        })
            .populate("user", "email studio.companyName studio.companySlug")
            .exec()

        if (!member) {
            return res.status(404).json({ message: "Member not found" })
        }

        member.role = role
        await member.save()

        return res.status(200).json({
            message: "Member updated",
            member: formatMemberResponse(member),
        })
    } catch (error) {
        console.error("updateMemberRole:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const removeMember = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const { memberId } = req.params
        if (!mongoose.isValidObjectId(memberId)) {
            return res.status(400).json({ message: "Invalid member id" })
        }

        const member = await CollaborationMember.findOne({
            _id: memberId,
            workspace: access.workspace._id,
            status: { $in: ["invited", "active"] },
        }).exec()

        if (!member) {
            return res.status(404).json({ message: "Member not found" })
        }

        member.status = "removed"
        member.removedAt = new Date()
        member.inviteTokenHash = null
        member.inviteExpiresAt = null
        await member.save()

        return res.status(200).json({ message: "Member removed" })
    } catch (error) {
        console.error("removeMember:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listPendingInvites = async (req, res) => {
    try {
        const invites = await CollaborationMember.find({
            user: req.user._id,
            status: "invited",
        })
            .populate({
                path: "workspace",
                match: { deletedAt: null },
                populate: {
                    path: "owner",
                    select: "email studio.companyName studio.companySlug",
                },
            })
            .sort({ createdAt: -1 })
            .exec()

        const items = invites
            .filter((row) => row.workspace)
            .map((row) => ({
                member: formatMemberResponse(row),
                workspace: formatWorkspaceResponse(row.workspace, {
                    role: row.role,
                }),
                expired:
                    row.inviteExpiresAt &&
                    new Date(row.inviteExpiresAt).getTime() < Date.now(),
            }))

        return res.status(200).json({ invites: items })
    } catch (error) {
        console.error("listPendingInvites:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const acceptInvite = async (req, res) => {
    try {
        const token = String(
            req.params.token ?? req.body?.token ?? ""
        ).trim()
        const workspaceId = req.params.id

        let member = null
        if (token) {
            const hash = hashCollaborationInviteToken(token)
            member = await CollaborationMember.findOne({
                inviteTokenHash: hash,
                status: "invited",
                user: req.user._id,
            })
                .populate("workspace")
                .exec()
        } else if (mongoose.isValidObjectId(workspaceId)) {
            member = await CollaborationMember.findOne({
                workspace: workspaceId,
                status: "invited",
                user: req.user._id,
            })
                .populate("workspace")
                .exec()
        }

        if (!member || !member.workspace || member.workspace.deletedAt) {
            return res.status(404).json({
                message: "Invite not found or already used",
            })
        }

        if (
            member.inviteExpiresAt &&
            new Date(member.inviteExpiresAt).getTime() < Date.now()
        ) {
            return res.status(410).json({
                message: "This invite has expired. Ask the owner to resend it.",
                code: "INVITE_EXPIRED",
            })
        }

        member.status = "active"
        member.acceptedAt = new Date()
        member.inviteTokenHash = null
        member.inviteExpiresAt = null
        await member.save()

        const workspace = await CollaborationWorkspace.findById(
            member.workspace._id
        )
            .populate("owner", "email studio.companyName studio.companySlug")
            .exec()

        return res.status(200).json({
            message: "Invite accepted",
            workspace: formatWorkspaceResponse(workspace, {
                role: member.role,
                memberCount: await countWorkspaceSeats(workspace._id),
            }),
            member: formatMemberResponse(member),
        })
    } catch (error) {
        console.error("acceptInvite:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const declineInvite = async (req, res) => {
    try {
        const token = String(
            req.params.token ?? req.body?.token ?? ""
        ).trim()

        let member = null
        if (token) {
            const hash = hashCollaborationInviteToken(token)
            member = await CollaborationMember.findOne({
                inviteTokenHash: hash,
                status: "invited",
                user: req.user._id,
            }).exec()
        } else if (mongoose.isValidObjectId(req.params.memberId)) {
            member = await CollaborationMember.findOne({
                _id: req.params.memberId,
                status: "invited",
                user: req.user._id,
            }).exec()
        }

        if (!member) {
            return res.status(404).json({ message: "Invite not found" })
        }

        member.status = "removed"
        member.removedAt = new Date()
        member.inviteTokenHash = null
        member.inviteExpiresAt = null
        await member.save()

        return res.status(200).json({ message: "Invite declined" })
    } catch (error) {
        console.error("declineInvite:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const leaveWorkspace = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "viewer"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }
        if (access.role === "owner") {
            return res.status(400).json({
                message: "Owners cannot leave — archive or delete the workspace instead",
            })
        }

        await CollaborationMember.updateOne(
            {
                workspace: access.workspace._id,
                user: req.user._id,
                status: "active",
            },
            {
                $set: {
                    status: "removed",
                    removedAt: new Date(),
                    inviteTokenHash: null,
                    inviteExpiresAt: null,
                },
            }
        )

        return res.status(200).json({ message: "Left workspace" })
    } catch (error) {
        console.error("leaveWorkspace:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
