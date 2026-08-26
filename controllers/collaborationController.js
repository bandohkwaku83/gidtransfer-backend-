import mongoose from "mongoose"
import CollaborationWorkspace from "../models/CollaborationWorkspace.js"
import CollaborationMember from "../models/CollaborationMember.js"
import CollaborationFolder from "../models/CollaborationFolder.js"
import CollaborationAsset from "../models/CollaborationAsset.js"
import Gallery from "../models/Gallery.js"
import {
    assertWorkspaceAccess,
    countWorkspaceSeats,
    loadWorkspaceOwnerUser,
    ownerCanManageCollaboration,
    workspacesAccessibleByUser,
} from "../utils/collaborationAccess.js"
import { formatWorkspaceResponse } from "../utils/collaborationFields.js"
import {
    deleteCollaborationAssetFiles,
} from "../utils/collaborationAssetStorage.js"
import { sendFeatureDenied, userHasFeature } from "../utils/planFeatures.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import { galleryOwnerFilter, galleryNotDeletedFilter } from "../utils/galleryFields.js"

const roleForWorkspace = async (userId, workspace) => {
    if (String(workspace.owner) === String(userId)) return "owner"
    const member = await CollaborationMember.findOne({
        workspace: workspace._id,
        user: userId,
        status: "active",
    })
        .select("role")
        .lean()
    return member?.role ?? "viewer"
}

export const listWorkspaces = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 100,
        })
        const status = String(req.query.status ?? "").trim().toLowerCase()
        const filter = await workspacesAccessibleByUser(req.user._id)
        if (status === "active" || status === "archived") {
            filter.status = status
        }

        const [total, rows] = await Promise.all([
            CollaborationWorkspace.countDocuments(filter),
            paginatedQuery(
                CollaborationWorkspace.find(filter)
                    .populate("owner", "email studio.companyName studio.companySlug")
                    .sort({ updatedAt: -1 }),
                pagination
            ).exec(),
        ])

        const seatCounts = await Promise.all(
            rows.map((w) => countWorkspaceSeats(w._id))
        )
        const roles = await Promise.all(
            rows.map((w) => roleForWorkspace(req.user._id, w))
        )

        return res.status(200).json({
            workspaces: rows.map((w, i) =>
                formatWorkspaceResponse(w, {
                    role: roles[i],
                    memberCount: seatCounts[i],
                })
            ),
            pagination: buildPaginationMeta({
                page: pagination.page,
                limit: pagination.limit,
                total,
            }),
            collaborationAvailable: userHasFeature(req.user, "collaboration"),
        })
    } catch (error) {
        console.error("listWorkspaces:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createWorkspace = async (req, res) => {
    try {
        if (!userHasFeature(req.user, "collaboration")) {
            return sendFeatureDenied(res, "collaboration", { user: req.user })
        }

        const name = String(req.body?.name ?? "").trim()
        if (!name) {
            return res.status(400).json({ message: "Workspace name is required" })
        }
        if (name.length > 200) {
            return res
                .status(400)
                .json({ message: "Workspace name is too long (max 200 characters)" })
        }

        const description = String(req.body?.description ?? "").trim()
        let linkedGallery = null
        const linkedGalleryId =
            req.body?.linkedGalleryId ?? req.body?.linkedGallery ?? null
        if (linkedGalleryId) {
            if (!mongoose.isValidObjectId(linkedGalleryId)) {
                return res.status(400).json({ message: "Invalid linkedGalleryId" })
            }
            const gallery = await Gallery.findOne({
                _id: linkedGalleryId,
                ...galleryOwnerFilter(req.user._id),
                ...galleryNotDeletedFilter(),
            })
                .select("_id")
                .lean()
            if (!gallery) {
                return res.status(404).json({ message: "Linked gallery not found" })
            }
            linkedGallery = gallery._id
        }

        const workspace = await CollaborationWorkspace.create({
            owner: req.user._id,
            name,
            description,
            linkedGallery,
            status: "active",
        })

        const owner = await loadWorkspaceOwnerUser(req.user._id)
        return res.status(201).json({
            message: "Workspace created",
            workspace: formatWorkspaceResponse(
                { ...workspace.toObject(), owner },
                { role: "owner", memberCount: 0 }
            ),
        })
    } catch (error) {
        console.error("createWorkspace:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getWorkspace = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "viewer"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const owner = await loadWorkspaceOwnerUser(access.workspace.owner)
        const memberCount = await countWorkspaceSeats(access.workspace._id)

        return res.status(200).json({
            workspace: formatWorkspaceResponse(
                { ...access.workspace.toObject(), owner },
                { role: access.role, memberCount }
            ),
        })
    } catch (error) {
        console.error("getWorkspace:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateWorkspace = async (req, res) => {
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

        const workspace = access.workspace
        if (req.body?.name !== undefined) {
            const name = String(req.body.name ?? "").trim()
            if (!name) {
                return res.status(400).json({ message: "Workspace name is required" })
            }
            if (name.length > 200) {
                return res
                    .status(400)
                    .json({ message: "Workspace name is too long (max 200 characters)" })
            }
            workspace.name = name
        }
        if (req.body?.description !== undefined) {
            workspace.description = String(req.body.description ?? "").trim()
        }
        if (req.body?.status !== undefined) {
            const status = String(req.body.status).trim().toLowerCase()
            if (status !== "active" && status !== "archived") {
                return res
                    .status(400)
                    .json({ message: "status must be active or archived" })
            }
            workspace.status = status
        }

        if (
            req.body?.linkedGalleryId !== undefined ||
            req.body?.linkedGallery !== undefined
        ) {
            const linkedGalleryId =
                req.body?.linkedGalleryId ?? req.body?.linkedGallery
            if (linkedGalleryId === null || linkedGalleryId === "") {
                workspace.linkedGallery = null
            } else {
                if (!mongoose.isValidObjectId(linkedGalleryId)) {
                    return res
                        .status(400)
                        .json({ message: "Invalid linkedGalleryId" })
                }
                const gallery = await Gallery.findOne({
                    _id: linkedGalleryId,
                    ...galleryOwnerFilter(req.user._id),
                    ...galleryNotDeletedFilter(),
                })
                    .select("_id")
                    .lean()
                if (!gallery) {
                    return res
                        .status(404)
                        .json({ message: "Linked gallery not found" })
                }
                workspace.linkedGallery = gallery._id
            }
        }

        await workspace.save()
        const owner = await loadWorkspaceOwnerUser(workspace.owner)
        const memberCount = await countWorkspaceSeats(workspace._id)

        return res.status(200).json({
            message: "Workspace updated",
            workspace: formatWorkspaceResponse(
                { ...workspace.toObject(), owner },
                { role: "owner", memberCount }
            ),
        })
    } catch (error) {
        console.error("updateWorkspace:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteWorkspace = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const workspace = access.workspace
        workspace.deletedAt = new Date()
        workspace.status = "archived"
        await workspace.save()

        await CollaborationMember.updateMany(
            {
                workspace: workspace._id,
                status: { $in: ["invited", "active"] },
            },
            { $set: { status: "removed", removedAt: new Date() } }
        )

        // Soft-delete assets; files kept until hard purge (optional later).
        await CollaborationAsset.updateMany(
            { workspace: workspace._id, deletedAt: null },
            {
                $set: {
                    deletedAt: new Date(),
                    restoreDeadline: new Date(
                        Date.now() +
                            CollaborationAsset.trashRestoreDays() * 24 * 60 * 60 * 1000
                    ),
                },
            }
        )

        return res.status(200).json({ message: "Workspace deleted" })
    } catch (error) {
        console.error("deleteWorkspace:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

/** Hard-delete asset files for a workspace (owner-only maintenance). */
export const purgeWorkspaceAssets = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const assets = await CollaborationAsset.find({
            workspace: access.workspace._id,
        }).exec()

        for (const asset of assets) {
            deleteCollaborationAssetFiles(access.workspace._id, asset)
        }
        await CollaborationAsset.deleteMany({ workspace: access.workspace._id })
        await CollaborationFolder.deleteMany({ workspace: access.workspace._id })

        return res.status(200).json({
            message: "Workspace assets purged",
            purgedCount: assets.length,
        })
    } catch (error) {
        console.error("purgeWorkspaceAssets:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
