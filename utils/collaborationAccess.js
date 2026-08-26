import mongoose from "mongoose"
import CollaborationWorkspace from "../models/CollaborationWorkspace.js"
import CollaborationMember from "../models/CollaborationMember.js"
import User from "../models/User.js"
import { roleAtLeast } from "./collaborationFields.js"
import { getEffectiveMaxTeamMembers } from "./planCatalog.js"
import { userHasFeature } from "./planFeatures.js"

const OWNER_SELECT = "email studio.companyName studio.companySlug"

/**
 * Resolve caller access to a workspace.
 * @returns {{ workspace, role: 'owner'|'editor'|'viewer' } | null}
 */
export const resolveWorkspaceAccess = async (userId, workspaceId) => {
    if (!mongoose.isValidObjectId(workspaceId) || !userId) return null

    const workspace = await CollaborationWorkspace.findOne({
        _id: workspaceId,
        deletedAt: null,
    }).exec()

    if (!workspace) return null

    if (String(workspace.owner) === String(userId)) {
        return { workspace, role: "owner" }
    }

    const member = await CollaborationMember.findOne({
        workspace: workspaceId,
        user: userId,
        status: "active",
    }).exec()

    if (!member) return null
    return { workspace, role: member.role }
}

export const assertWorkspaceAccess = async (
    userId,
    workspaceId,
    minRole = "viewer"
) => {
    const access = await resolveWorkspaceAccess(userId, workspaceId)
    if (!access) return { error: { status: 404, message: "Workspace not found" } }
    if (!roleAtLeast(access.role, minRole)) {
        return {
            error: {
                status: 403,
                message: "You do not have permission for this action",
            },
        }
    }
    return access
}

export const loadWorkspaceOwnerUser = async (ownerId) => {
    if (!ownerId) return null
    return User.findById(ownerId).select(OWNER_SELECT).lean()
}

/** Active + invited seats (excludes removed). Owner is not a seat. */
export const countWorkspaceSeats = async (workspaceId) =>
    CollaborationMember.countDocuments({
        workspace: workspaceId,
        status: { $in: ["invited", "active"] },
    })

export const seatLimitReached = async (ownerUser, workspaceId) => {
    const max = getEffectiveMaxTeamMembers(ownerUser)
    if (max == null) return false
    if (max <= 0) return true
    const used = await countWorkspaceSeats(workspaceId)
    return used >= max
}

export const ownerCanManageCollaboration = (ownerUser) =>
    userHasFeature(ownerUser, "collaboration")

/** Workspace ids where the user is an active member (not owner). */
export const memberWorkspaceIds = async (userId) => {
    const rows = await CollaborationMember.find({
        user: userId,
        status: "active",
    })
        .select("workspace")
        .lean()
    return rows.map((r) => r.workspace)
}

/** Async filter: workspaces owned by user or where they are an active member. */
export const workspacesAccessibleByUser = async (userId) => {
    const memberIds = await memberWorkspaceIds(userId)
    return {
        deletedAt: null,
        $or: [{ owner: userId }, { _id: { $in: memberIds } }],
    }
}

