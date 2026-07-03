import mongoose from "mongoose"
import GalleryFinal from "../models/GalleryFinal.js"
import {
    formatGalleryFinalResponse,
    loadOwnedGallery,
    resolveGallerySetIdForUpload,
} from "../utils/galleryDetailHelpers.js"
import {
    computeRestoreDeadline,
    effectiveRestoreDeadline,
    isRestoreExpired,
} from "../utils/galleryTrash.js"
import {
    deleteGalleryFinalFile,
    saveGalleryFinalFile,
    validateGalleryFinalFile,
    validateGalleryFinalMeta,
    createGalleryFinalPresignedUpload,
    verifyGalleryFinalInStorage,
    galleryFinalPublicUrl,
} from "../utils/galleryFinalStorage.js"
import { parseDirectUploadFiles } from "../utils/directUploadHelpers.js"
import { s3Configured } from "../utils/s3Storage.js"
import {
    GALLERY_MEDIA_SORT,
    getNextGalleryMediaSortOrder,
    parseReorderIdList,
    persistGalleryMediaReorder,
    validateGalleryReorderIds,
} from "../utils/galleryMediaOrder.js"
import {
    resolveGalleryFinalLockUpdate,
    resolveGalleryFinalUploadPayment,
} from "../utils/galleryFinalPaymentFields.js"

export const listGalleryFinals = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const includeTrash =
            String(req.query.trash) === "1" ||
            String(req.query.trash || "").toLowerCase() === "true"

        const filter = { gallery: gallery._id }
        if (!includeTrash) {
            filter.deletedAt = null
        }

        const rows = await GalleryFinal.find(filter)
            .sort(GALLERY_MEDIA_SORT)
            .exec()

        return res.status(200).json({
            finals: rows.map(formatGalleryFinalResponse),
        })
    } catch (error) {
        console.error("listGalleryFinals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listGalleryFlaggedFinals = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const rows = await GalleryFinal.find({
            gallery: gallery._id,
            deletedAt: null,
            flaggedByClient: true,
        })
            .sort({ flaggedAt: -1, updatedAt: -1, createdAt: -1 })
            .exec()

        const flaggedFinals = rows.map((row) => {
            const final = formatGalleryFinalResponse(row, { absoluteUrls: true })
            return {
                ...final,
                comment: final.clientComment,
            }
        })

        return res.status(200).json({
            count: flaggedFinals.length,
            flaggedFinals,
        })
    } catch (error) {
        console.error("listGalleryFlaggedFinals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const presignGalleryFinalUploads = async (req, res) => {
    try {
        if (!s3Configured()) {
            return res.status(503).json({
                message:
                    "Direct S3 upload is not configured. Set S3_BUCKET, AWS_REGION, and AWS credentials in .env",
            })
        }

        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const parsed = parseDirectUploadFiles(req.body)
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error })
        }

        const uploads = []
        for (const file of parsed.files) {
            const err = validateGalleryFinalMeta(file)
            if (err) {
                return res.status(400).json({ message: err })
            }

            try {
                const presigned = await createGalleryFinalPresignedUpload({
                    galleryId: gallery._id,
                    mimeType: file.mimeType,
                    sizeBytes: file.sizeBytes,
                })
                uploads.push({
                    uploadId: presigned.uploadId,
                    storedFilename: presigned.storedFilename,
                    originalFilename: file.originalFilename,
                    mimeType: file.mimeType,
                    sizeBytes: file.sizeBytes,
                    presignedUrl: presigned.presignedUrl,
                    method: presigned.method,
                    headers: presigned.headers,
                    publicUrl: presigned.publicUrl,
                    expiresIn: presigned.expiresIn,
                })
            } catch (err) {
                return res.status(400).json({ message: err.message })
            }
        }

        return res.status(200).json({ uploads })
    } catch (error) {
        console.error("presignGalleryFinalUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const completeGalleryFinalUploads = async (req, res) => {
    try {
        if (!s3Configured()) {
            return res.status(503).json({
                message: "Direct S3 upload is not configured",
            })
        }

        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const parsed = parseDirectUploadFiles(req.body)
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error })
        }

        for (const file of parsed.files) {
            if (!file.storedFilename) {
                return res.status(400).json({
                    message: "Each file must include storedFilename from presign response",
                })
            }
            const err = validateGalleryFinalMeta(file)
            if (err) {
                return res.status(400).json({ message: err })
            }
            const verifyErr = await verifyGalleryFinalInStorage({
                galleryId: gallery._id,
                storedFilename: file.storedFilename,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
            })
            if (verifyErr) {
                return res.status(400).json({ message: verifyErr })
            }
        }

        const setResolved = await resolveGallerySetIdForUpload(gallery._id, req.body)
        if (setResolved.error) {
            return res.status(400).json({ message: setResolved.error })
        }
        const uploadSetId = setResolved.setId

        const payment = resolveGalleryFinalUploadPayment(req.body)
        if (payment.error) {
            return res.status(400).json({ message: payment.error })
        }
        const { clientPaid, outstandingBalanceGhs, isLocked } = payment

        const created = []
        let nextSortOrder = await getNextGalleryMediaSortOrder(
            GalleryFinal,
            gallery._id
        )

        for (const file of parsed.files) {
            const name = file.originalFilename?.trim() || "final"
            const isVideo = file.mimeType?.startsWith("video/")

            const row = await GalleryFinal.create({
                gallery: gallery._id,
                owner: req.user._id,
                originalFilename: name,
                storedFilename: file.storedFilename,
                url: galleryFinalPublicUrl(gallery._id, file.storedFilename),
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
                isVideo,
                clientPaid,
                outstandingBalanceGhs,
                isLocked,
                sortOrder: nextSortOrder,
                ...(uploadSetId !== undefined ? { set: uploadSetId } : {}),
            })
            nextSortOrder += 1
            created.push(formatGalleryFinalResponse(row))
        }

        return res.status(201).json({
            message: "Finals uploaded",
            finals: created,
        })
    } catch (error) {
        console.error("completeGalleryFinalUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const uploadGalleryFinals = async (req, res) => {
    try {
        if (s3Configured()) {
            return res.status(400).json({
                message:
                    "Server-side upload is disabled when S3 is configured. Use POST /api/galleries/:id/finals/presign then POST /api/galleries/:id/finals/complete",
            })
        }

        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const files = req.files ?? []
        if (!files.length) {
            return res.status(400).json({ message: "No finals provided" })
        }

        const setResolved = await resolveGallerySetIdForUpload(gallery._id, req.body)
        if (setResolved.error) {
            return res.status(400).json({ message: setResolved.error })
        }
        const uploadSetId = setResolved.setId

        const payment = resolveGalleryFinalUploadPayment(req.body)
        if (payment.error) {
            return res.status(400).json({ message: payment.error })
        }
        const { clientPaid, outstandingBalanceGhs, isLocked } = payment

        const created = []
        let nextSortOrder = await getNextGalleryMediaSortOrder(
            GalleryFinal,
            gallery._id
        )

        for (const file of files) {
            const err = validateGalleryFinalFile(file)
            if (err) {
                return res.status(400).json({ message: err })
            }

            const saved = await saveGalleryFinalFile(String(gallery._id), file)
            const name = file.originalname?.trim() || "final"

            const row = await GalleryFinal.create({
                gallery: gallery._id,
                owner: req.user._id,
                originalFilename: name,
                storedFilename: saved.storedFilename,
                url: saved.url,
                mimeType: file.mimetype,
                sizeBytes: file.size,
                isVideo: saved.isVideo,
                clientPaid,
                outstandingBalanceGhs,
                isLocked,
                sortOrder: nextSortOrder,
                ...(uploadSetId !== undefined ? { set: uploadSetId } : {}),
            })
            nextSortOrder += 1
            created.push(formatGalleryFinalResponse(row))
        }

        return res.status(201).json({
            message: "Finals uploaded",
            finals: created,
        })
    } catch (error) {
        console.error("uploadGalleryFinals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGalleryFinalLock = async (req, res) => {
    try {
        const { id, finalId } = req.params
        if (!mongoose.isValidObjectId(finalId)) {
            return res.status(400).json({ message: "Invalid final id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const row = await GalleryFinal.findOne({
            _id: finalId,
            gallery: gallery._id,
            deletedAt: null,
        })

        if (!row) {
            return res.status(404).json({ message: "Final not found" })
        }

        const update = resolveGalleryFinalLockUpdate(req.body, row)
        if (update.error) {
            return res.status(400).json({ message: update.error })
        }

        row.isLocked = update.isLocked
        row.outstandingBalanceGhs = update.outstandingBalanceGhs
        row.clientPaid = update.clientPaid

        await row.save()

        return res.status(200).json({
            message: row.isLocked ? "Final locked" : "Final unlocked",
            final: formatGalleryFinalResponse(row),
        })
    } catch (error) {
        console.error("updateGalleryFinalLock:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteGalleryFinal = async (req, res) => {
    try {
        const { id, finalId } = req.params
        if (!mongoose.isValidObjectId(finalId)) {
            return res.status(400).json({ message: "Invalid final id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const row = await GalleryFinal.findOne({
            _id: finalId,
            gallery: gallery._id,
            deletedAt: null,
        })

        if (!row) {
            return res.status(404).json({ message: "Final not found" })
        }

        const now = new Date()
        row.deletedAt = now
        row.restoreDeadline = computeRestoreDeadline(now)
        await row.save()

        return res.status(200).json({
            message: "Final moved to trash",
            final: formatGalleryFinalResponse(row),
        })
    } catch (error) {
        console.error("deleteGalleryFinal:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const restoreGalleryFinal = async (req, res) => {
    try {
        const { id, finalId } = req.params
        if (!mongoose.isValidObjectId(finalId)) {
            return res.status(400).json({ message: "Invalid final id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const row = await GalleryFinal.findOne({
            _id: finalId,
            gallery: gallery._id,
            deletedAt: { $ne: null },
        })

        if (!row) {
            return res.status(404).json({ message: "Final not found in trash" })
        }

        if (isRestoreExpired(effectiveRestoreDeadline(row))) {
            return res.status(410).json({ message: "Restore deadline has passed" })
        }

        row.deletedAt = null
        row.restoreDeadline = null
        row.sortOrder = await getNextGalleryMediaSortOrder(
            GalleryFinal,
            gallery._id
        )
        await row.save()

        return res.status(200).json({
            message: "Final restored",
            final: formatGalleryFinalResponse(row),
        })
    } catch (error) {
        console.error("restoreGalleryFinal:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const bulkDeleteGalleryFinals = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const all = req.body?.all === true || req.body?.all === "true"
        const ids = Array.isArray(req.body?.finalIds)
            ? req.body.finalIds.filter((x) => mongoose.isValidObjectId(x))
            : []

        if (!all && !ids.length) {
            return res.status(400).json({
                message: "Provide finalIds array or all: true",
            })
        }

        const filter = { gallery: gallery._id, deletedAt: null }
        if (!all) filter._id = { $in: ids }

        const now = new Date()
        const deadline = computeRestoreDeadline(now)

        const result = await GalleryFinal.updateMany(filter, {
            $set: { deletedAt: now, restoreDeadline: deadline },
        })

        return res.status(200).json({
            message: "Finals moved to trash",
            count: result.modifiedCount ?? result.nModified ?? 0,
        })
    } catch (error) {
        console.error("bulkDeleteGalleryFinals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const reorderGalleryFinals = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const finalIds = parseReorderIdList(req.body, "finalIds", "final_ids")
        const active = await GalleryFinal.find({
            gallery: gallery._id,
            deletedAt: null,
        })
            .select("_id")
            .lean()

        const error = validateGalleryReorderIds(finalIds, active, "finalIds")
        if (error) {
            return res.status(400).json({ message: error })
        }

        await persistGalleryMediaReorder(GalleryFinal, gallery._id, finalIds)

        return res.status(200).json({ message: "Order saved" })
    } catch (error) {
        console.error("reorderGalleryFinals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
