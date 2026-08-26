import mongoose from "mongoose"
import CollaborationAsset from "../models/CollaborationAsset.js"
import CollaborationFolder from "../models/CollaborationFolder.js"
import User from "../models/User.js"
import { assertWorkspaceAccess } from "../utils/collaborationAccess.js"
import { formatAssetResponse } from "../utils/collaborationFields.js"
import {
    collaborationAssetPublicUrl,
    createCollaborationAssetPresignedUpload,
    deleteCollaborationAssetFiles,
    saveCollaborationAssetFile,
    validateCollaborationAssetFile,
    validateCollaborationAssetMeta,
    verifyCollaborationAssetInStorage,
} from "../utils/collaborationAssetStorage.js"
import { parseDirectUploadFiles } from "../utils/directUploadHelpers.js"
import { s3Configured } from "../utils/s3Storage.js"
import { parseGalleryUploadKind } from "../utils/galleryMediaTypes.js"
import { isGalleryVideoMime } from "../utils/galleryMediaTypes.js"
import {
    sendVideoUploadDenied,
    videoBytesFromFiles,
    videoUploadDeniedPayload,
} from "../utils/planVideoUploads.js"
import { userHasFeature } from "../utils/planFeatures.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"

const urlHelpers = { assetPublicUrl: collaborationAssetPublicUrl }

const resolveUploadKind = (req, { required = false } = {}) => {
    if (req.uploadKind === "photo" || req.uploadKind === "video") {
        return req.uploadKind
    }
    const raw =
        req.body?.mediaType ??
        req.body?.media_type ??
        req.body?.kind ??
        req.query?.mediaType ??
        req.query?.kind
    const kind = parseGalleryUploadKind(raw)
    if (required && !kind) {
        return {
            error:
                'mediaType is required: use "photo" or "video" (or call /uploads/photos or /uploads/videos)',
        }
    }
    return kind
}

export const withCollabUploadKind = (kind) => (req, _res, next) => {
    req.uploadKind = kind
    next()
}

const loadOwnerUserForLimits = async (ownerId, fallbackUser) => {
    if (fallbackUser && String(fallbackUser._id) === String(ownerId)) {
        return fallbackUser
    }
    return User.findById(ownerId).exec()
}

const denyVideoIfNeeded = async (ownerUser, res, files) => {
    const incoming = videoBytesFromFiles(files)
    if (incoming <= 0) return false
    const denied = await videoUploadDeniedPayload(ownerUser, incoming)
    if (!denied) return false
    sendVideoUploadDenied(res, denied)
    return true
}

const resolveFolderId = async (workspaceId, rawFolderId) => {
    if (rawFolderId === undefined || rawFolderId === null || rawFolderId === "") {
        return { folderId: null }
    }
    if (!mongoose.isValidObjectId(rawFolderId)) {
        return { error: "Invalid folder id" }
    }
    const folder = await CollaborationFolder.findOne({
        _id: rawFolderId,
        workspace: workspaceId,
    })
        .select("_id")
        .lean()
    if (!folder) return { error: "Folder not found" }
    return { folderId: folder._id }
}

const nextSortOrder = async (workspaceId) => {
    const last = await CollaborationAsset.findOne({
        workspace: workspaceId,
        deletedAt: null,
    })
        .sort({ sortOrder: -1 })
        .select("sortOrder")
        .lean()
    return last && typeof last.sortOrder === "number" ? last.sortOrder + 1 : 0
}

const persistAsset = async ({
    workspace,
    uploadedBy,
    folderId,
    originalFilename,
    storedFilename,
    url,
    mimeType,
    sizeBytes,
    isVideo,
    sortOrder,
}) =>
    CollaborationAsset.create({
        workspace: workspace._id,
        owner: workspace.owner,
        uploadedBy,
        folder: folderId,
        originalFilename,
        storedFilename,
        url,
        mimeType,
        sizeBytes,
        isVideo,
        sortOrder,
    })

export const listAssets = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "viewer"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = {
            workspace: access.workspace._id,
            deletedAt: null,
        }

        const folderRaw = req.query.folderId ?? req.query.folder
        if (folderRaw === "null" || folderRaw === "none") {
            filter.folder = null
        } else if (folderRaw) {
            if (!mongoose.isValidObjectId(folderRaw)) {
                return res.status(400).json({ message: "Invalid folder id" })
            }
            filter.folder = folderRaw
        }

        const mediaType = String(req.query.mediaType ?? "").trim().toLowerCase()
        if (mediaType === "photo") filter.isVideo = { $ne: true }
        if (mediaType === "video") filter.isVideo = true

        const [total, rows] = await Promise.all([
            CollaborationAsset.countDocuments(filter),
            paginatedQuery(
                CollaborationAsset.find(filter)
                    .populate(
                        "uploadedBy",
                        "email studio.companyName studio.companySlug"
                    )
                    .sort({ sortOrder: 1, createdAt: 1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            assets: rows.map((a) => formatAssetResponse(a, urlHelpers)),
            pagination: buildPaginationMeta({
                page: pagination.page,
                limit: pagination.limit,
                total,
            }),
        })
    } catch (error) {
        console.error("listAssets:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const presignAssetUploads = async (req, res) => {
    try {
        if (!s3Configured()) {
            return res.status(503).json({
                message: "Direct S3 upload is not configured",
            })
        }

        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const ownerUser = await loadOwnerUserForLimits(
            access.workspace.owner,
            req.user
        )
        if (!userHasFeature(ownerUser, "collaboration")) {
            return res.status(403).json({
                message:
                    "Collaboration uploads require the workspace owner to be on Premium",
                code: "PLAN_FEATURE_REQUIRED",
                feature: "collaboration",
            })
        }

        const kindResolved = resolveUploadKind(req)
        if (kindResolved?.error) {
            return res.status(400).json({ message: kindResolved.error })
        }
        const uploadKind = kindResolved

        const parsed = parseDirectUploadFiles(req.body)
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error })
        }

        for (const file of parsed.files) {
            const err = validateCollaborationAssetMeta(file, { kind: uploadKind })
            if (err) return res.status(400).json({ message: err })
        }

        if (await denyVideoIfNeeded(ownerUser, res, parsed.files)) return

        const uploads = await Promise.all(
            parsed.files.map(async (file) => {
                try {
                    const presigned = await createCollaborationAssetPresignedUpload({
                        workspaceId: access.workspace._id,
                        mimeType: file.mimeType,
                        sizeBytes: file.sizeBytes,
                    })
                    return {
                        uploadId: presigned.uploadId,
                        storedFilename: presigned.storedFilename,
                        originalFilename: file.originalFilename,
                        mimeType: file.mimeType,
                        sizeBytes: file.sizeBytes,
                        mediaType:
                            uploadKind ??
                            (file.mimeType?.startsWith("video/")
                                ? "video"
                                : "photo"),
                        presignedUrl: presigned.presignedUrl,
                        method: presigned.method,
                        headers: presigned.headers,
                        publicUrl: presigned.publicUrl,
                        expiresIn: presigned.expiresIn,
                    }
                } catch (err) {
                    err.statusCode = 400
                    throw err
                }
            })
        )

        return res.status(200).json({
            uploads,
            ...(uploadKind ? { mediaType: uploadKind } : {}),
        })
    } catch (error) {
        if (error?.statusCode === 400) {
            return res.status(400).json({ message: error.message })
        }
        console.error("presignAssetUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const completeAssetUploads = async (req, res) => {
    try {
        if (!s3Configured()) {
            return res.status(503).json({
                message: "Direct S3 upload is not configured",
            })
        }

        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const ownerUser = await loadOwnerUserForLimits(
            access.workspace.owner,
            req.user
        )
        if (!userHasFeature(ownerUser, "collaboration")) {
            return res.status(403).json({
                message:
                    "Collaboration uploads require the workspace owner to be on Premium",
                code: "PLAN_FEATURE_REQUIRED",
                feature: "collaboration",
            })
        }

        const kindResolved = resolveUploadKind(req)
        if (kindResolved?.error) {
            return res.status(400).json({ message: kindResolved.error })
        }
        const uploadKind = kindResolved

        const parsed = parseDirectUploadFiles(req.body)
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error })
        }

        for (const file of parsed.files) {
            if (!file.storedFilename) {
                return res.status(400).json({
                    message:
                        "Each file must include storedFilename from presign response",
                })
            }
            const err = validateCollaborationAssetMeta(file, { kind: uploadKind })
            if (err) return res.status(400).json({ message: err })
        }

        if (await denyVideoIfNeeded(ownerUser, res, parsed.files)) return

        const folderResolved = await resolveFolderId(
            access.workspace._id,
            req.body?.folderId ?? req.body?.folder
        )
        if (folderResolved.error) {
            return res.status(400).json({ message: folderResolved.error })
        }

        let sortOrder = await nextSortOrder(access.workspace._id)
        const created = []

        for (const file of parsed.files) {
            const verifyErr = await verifyCollaborationAssetInStorage({
                workspaceId: access.workspace._id,
                storedFilename: file.storedFilename,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
            })
            if (verifyErr) {
                return res.status(400).json({ message: verifyErr })
            }

            const isVideo = isGalleryVideoMime(file.mimeType)
            const asset = await persistAsset({
                workspace: access.workspace,
                uploadedBy: (req.actor ?? req.user)._id,
                folderId: folderResolved.folderId,
                originalFilename: file.originalFilename,
                storedFilename: file.storedFilename,
                url: collaborationAssetPublicUrl(
                    access.workspace._id,
                    file.storedFilename
                ),
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                isVideo,
                sortOrder,
            })
            sortOrder += 1
            created.push(asset)
        }

        const populated = await CollaborationAsset.find({
            _id: { $in: created.map((a) => a._id) },
        })
            .populate("uploadedBy", "email studio.companyName studio.companySlug")
            .exec()

        return res.status(201).json({
            message: "Upload complete",
            assets: populated.map((a) => formatAssetResponse(a, urlHelpers)),
        })
    } catch (error) {
        console.error("completeAssetUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const uploadAssets = async (req, res) => {
    try {
        if (s3Configured()) {
            return res.status(400).json({
                message:
                    "Server-side upload is disabled when S3 is configured. Use POST /api/collaborations/:id/uploads/presign then POST /api/collaborations/:id/uploads/complete",
            })
        }

        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const ownerUser = await loadOwnerUserForLimits(
            access.workspace.owner,
            req.user
        )
        if (!userHasFeature(ownerUser, "collaboration")) {
            return res.status(403).json({
                message:
                    "Collaboration uploads require the workspace owner to be on Premium",
                code: "PLAN_FEATURE_REQUIRED",
                feature: "collaboration",
            })
        }

        const kindResolved = resolveUploadKind(req)
        if (kindResolved?.error) {
            return res.status(400).json({ message: kindResolved.error })
        }
        const uploadKind = kindResolved

        const files = req.files ?? []
        if (!files.length) {
            return res.status(400).json({ message: "No files uploaded" })
        }

        for (const file of files) {
            const err = validateCollaborationAssetFile(file, { kind: uploadKind })
            if (err) return res.status(400).json({ message: err })
        }

        if (await denyVideoIfNeeded(ownerUser, res, files)) return

        const folderResolved = await resolveFolderId(
            access.workspace._id,
            req.body?.folderId ?? req.body?.folder
        )
        if (folderResolved.error) {
            return res.status(400).json({ message: folderResolved.error })
        }

        let sortOrder = await nextSortOrder(access.workspace._id)
        const created = []

        for (const file of files) {
            const saved = await saveCollaborationAssetFile(
                access.workspace._id,
                file
            )
            const asset = await persistAsset({
                workspace: access.workspace,
                uploadedBy: (req.actor ?? req.user)._id,
                folderId: folderResolved.folderId,
                originalFilename: file.originalname || "upload",
                storedFilename: saved.storedFilename,
                url: saved.url,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                isVideo: saved.isVideo,
                sortOrder,
            })
            sortOrder += 1
            created.push(asset)
        }

        const populated = await CollaborationAsset.find({
            _id: { $in: created.map((a) => a._id) },
        })
            .populate("uploadedBy", "email studio.companyName studio.companySlug")
            .exec()

        return res.status(201).json({
            message: "Upload complete",
            assets: populated.map((a) => formatAssetResponse(a, urlHelpers)),
        })
    } catch (error) {
        console.error("uploadAssets:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateAsset = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const { assetId } = req.params
        if (!mongoose.isValidObjectId(assetId)) {
            return res.status(400).json({ message: "Invalid asset id" })
        }

        const asset = await CollaborationAsset.findOne({
            _id: assetId,
            workspace: access.workspace._id,
            deletedAt: null,
        }).exec()

        if (!asset) {
            return res.status(404).json({ message: "Asset not found" })
        }

        if (req.body?.folderId !== undefined || req.body?.folder !== undefined) {
            const folderResolved = await resolveFolderId(
                access.workspace._id,
                req.body?.folderId ?? req.body?.folder
            )
            if (folderResolved.error) {
                return res.status(400).json({ message: folderResolved.error })
            }
            asset.folder = folderResolved.folderId
        }

        if (req.body?.sortOrder !== undefined) {
            const n = Number(req.body.sortOrder)
            if (!Number.isFinite(n)) {
                return res.status(400).json({ message: "Invalid sortOrder" })
            }
            asset.sortOrder = n
        }

        await asset.save()
        await asset.populate(
            "uploadedBy",
            "email studio.companyName studio.companySlug"
        )

        return res.status(200).json({
            message: "Asset updated",
            asset: formatAssetResponse(asset, urlHelpers),
        })
    } catch (error) {
        console.error("updateAsset:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteAsset = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "editor"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const { assetId } = req.params
        if (!mongoose.isValidObjectId(assetId)) {
            return res.status(400).json({ message: "Invalid asset id" })
        }

        const asset = await CollaborationAsset.findOne({
            _id: assetId,
            workspace: access.workspace._id,
            deletedAt: null,
        }).exec()

        if (!asset) {
            return res.status(404).json({ message: "Asset not found" })
        }

        asset.deletedAt = new Date()
        asset.restoreDeadline = new Date(
            Date.now() +
                CollaborationAsset.trashRestoreDays() * 24 * 60 * 60 * 1000
        )
        await asset.save()

        return res.status(200).json({ message: "Asset deleted" })
    } catch (error) {
        console.error("deleteAsset:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const hardDeleteAsset = async (req, res) => {
    try {
        const access = await assertWorkspaceAccess(
            req.user._id,
            req.params.id,
            "owner"
        )
        if (access.error) {
            return res.status(access.error.status).json({ message: access.error.message })
        }

        const { assetId } = req.params
        if (!mongoose.isValidObjectId(assetId)) {
            return res.status(400).json({ message: "Invalid asset id" })
        }

        const asset = await CollaborationAsset.findOne({
            _id: assetId,
            workspace: access.workspace._id,
        }).exec()

        if (!asset) {
            return res.status(404).json({ message: "Asset not found" })
        }

        deleteCollaborationAssetFiles(access.workspace._id, asset)
        await asset.deleteOne()

        return res.status(200).json({ message: "Asset permanently deleted" })
    } catch (error) {
        console.error("hardDeleteAsset:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
