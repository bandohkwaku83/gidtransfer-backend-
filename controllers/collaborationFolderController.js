import mongoose from "mongoose"
import CollaborationFolder from "../models/CollaborationFolder.js"
import CollaborationAsset from "../models/CollaborationAsset.js"
import { assertWorkspaceAccess } from "../utils/collaborationAccess.js"
import { formatFolderResponse } from "../utils/collaborationFields.js"

export const listFolders = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "viewer"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const rows = await CollaborationFolder.find({
            workspace: access.workspace._id,
        })
            .sort({ sortOrder: 1, createdAt: 1 })
            .exec()

        return res.status(200).json({
            folders: rows.map(formatFolderResponse),
        })
    } catch (error) {
        console.error("listFolders:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createFolder = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const name = String(req.body?.name ?? "").trim()
        if (!name) {
            return res.status(400).json({ message: "Folder name is required" })
        }
        if (name.length > 80) {
            return res
                .status(400)
                .json({ message: "Folder name is too long (max 80 characters)" })
        }

        const last = await CollaborationFolder.findOne({
            workspace: access.workspace._id,
        })
            .sort({ sortOrder: -1 })
            .select("sortOrder")
            .exec()
        const sortOrder =
            last && typeof last.sortOrder === "number" ? last.sortOrder + 1 : 0

        const folder = await CollaborationFolder.create({
            workspace: access.workspace._id,
            owner: access.workspace.owner,
            name,
            sortOrder,
        })

        return res.status(201).json({
            message: "Folder created",
            folder: formatFolderResponse(folder),
        })
    } catch (error) {
        console.error("createFolder:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateFolder = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const { folderId } = req.params
        if (!mongoose.isValidObjectId(folderId)) {
            return res.status(400).json({ message: "Invalid folder id" })
        }

        const folder = await CollaborationFolder.findOne({
            _id: folderId,
            workspace: access.workspace._id,
        }).exec()

        if (!folder) {
            return res.status(404).json({ message: "Folder not found" })
        }

        if (req.body?.name !== undefined) {
            const name = String(req.body.name ?? "").trim()
            if (!name) {
                return res.status(400).json({ message: "Folder name is required" })
            }
            if (name.length > 80) {
                return res
                    .status(400)
                    .json({ message: "Folder name is too long (max 80 characters)" })
            }
            folder.name = name
        }
        if (req.body?.sortOrder !== undefined) {
            const n = Number(req.body.sortOrder)
            if (!Number.isFinite(n)) {
                return res.status(400).json({ message: "Invalid sortOrder" })
            }
            folder.sortOrder = n
        }

        await folder.save()
        return res.status(200).json({
            message: "Folder updated",
            folder: formatFolderResponse(folder),
        })
    } catch (error) {
        console.error("updateFolder:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteFolder = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const { folderId } = req.params
        if (!mongoose.isValidObjectId(folderId)) {
            return res.status(400).json({ message: "Invalid folder id" })
        }

        const folder = await CollaborationFolder.findOne({
            _id: folderId,
            workspace: access.workspace._id,
        }).exec()

        if (!folder) {
            return res.status(404).json({ message: "Folder not found" })
        }

        await CollaborationAsset.updateMany(
            { workspace: access.workspace._id, folder: folder._id },
            { $set: { folder: null } }
        )
        await folder.deleteOne()

        return res.status(200).json({ message: "Folder deleted" })
    } catch (error) {
        console.error("deleteFolder:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
