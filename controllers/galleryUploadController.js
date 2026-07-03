import mongoose from "mongoose"
import GalleryPhoto from "../models/GalleryPhoto.js"
import {
    formatGalleryPhotoResponse,
    loadOwnedGallery,
    resolveGallerySetIdForUpload,
} from "../utils/galleryDetailHelpers.js"
import {
    computeRestoreDeadline,
    effectiveRestoreDeadline,
    isRestoreExpired,
} from "../utils/galleryTrash.js"
import {
    deleteGalleryPhotoAssets,
    saveGalleryPhotoFile,
    validateGalleryPhotoFile,
    validateGalleryPhotoMeta,
    createGalleryPhotoPresignedUpload,
    verifyGalleryPhotoInStorage,
    galleryPhotoPublicUrl,
} from "../utils/galleryPhotoStorage.js"
import { parseDirectUploadFiles } from "../utils/directUploadHelpers.js"
import { s3Configured } from "../utils/s3Storage.js"
import { scheduleGalleryPhotoDerivatives } from "../utils/galleryDerivativeQueue.js"
import { resolveWatermarkPreviewText } from "../utils/previewWatermark.js"
import {
    GALLERY_MEDIA_SORT,
    getNextGalleryMediaSortOrder,
    parseReorderIdList,
    persistGalleryMediaReorder,
    validateGalleryReorderIds,
} from "../utils/galleryMediaOrder.js"

const parseOnConflict = (value) => {
    const s = String(value ?? "skip").trim().toLowerCase()
    if (s === "replace" || s === "skip" || s === "cancel") return s
    return "skip"
}

const parseApplyPreviewWatermark = (body, gallery) => {
    const raw =
        body?.applyPreviewWatermark ??
        body?.apply_preview_watermark ??
        body?.watermarkPreview ??
        body?.watermark_preview
    if (raw === undefined || raw === null || raw === "") {
        return gallery.watermarkPreviewEnabled === true
    }
    if (typeof raw === "boolean") return raw
    const normalized = String(raw).trim().toLowerCase()
    if (normalized === "true" || normalized === "1" || normalized === "on") {
        return true
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
        return false
    }
    return gallery.watermarkPreviewEnabled === true
}

async function persistGalleryPhotoWithDerivatives({
    gallery,
    file,
    replace,
    uploadSetId,
    ownerId,
    applyPreviewWatermark,
    watermarkText,
    nextSortOrder,
    directMeta,
}) {
    const name =
        directMeta?.originalFilename ??
        file?.originalname?.trim() ??
        "upload.jpg"
    const mimeType = directMeta?.mimeType ?? file?.mimetype
    const sizeBytes = directMeta?.sizeBytes ?? file?.size

    if (replace) {
        deleteGalleryPhotoAssets(gallery._id, replace)
        const saved = directMeta
            ? {
                  storedFilename: directMeta.storedFilename,
                  url: galleryPhotoPublicUrl(
                      gallery._id,
                      directMeta.storedFilename
                  ),
                  isVideo: directMeta.isVideo,
              }
            : await saveGalleryPhotoFile(String(gallery._id), file)
        replace.originalFilename = name
        replace.storedFilename = saved.storedFilename
        replace.url = saved.url
        replace.mimeType = mimeType
        replace.sizeBytes = sizeBytes
        replace.isVideo = saved.isVideo
        replace.thumbStoredFilename = null
        replace.previewWmStoredFilename = null
        if (uploadSetId !== undefined) replace.set = uploadSetId
        await replace.save()

        scheduleGalleryPhotoDerivatives({
            photoId: replace._id,
            galleryId: gallery._id,
            storedFilename: saved.storedFilename,
            mimeType,
            watermarkText,
            applyWatermark: applyPreviewWatermark,
        })
        return replace
    }

    const saved = directMeta
        ? {
              storedFilename: directMeta.storedFilename,
              url: galleryPhotoPublicUrl(gallery._id, directMeta.storedFilename),
              isVideo: directMeta.isVideo,
          }
        : await saveGalleryPhotoFile(String(gallery._id), file)

    const photo = await GalleryPhoto.create({
        gallery: gallery._id,
        owner: ownerId,
        originalFilename: name,
        storedFilename: saved.storedFilename,
        url: saved.url,
        mimeType,
        sizeBytes,
        isVideo: saved.isVideo,
        sortOrder: nextSortOrder,
        ...(uploadSetId !== undefined ? { set: uploadSetId } : {}),
    })

    scheduleGalleryPhotoDerivatives({
        photoId: photo._id,
        galleryId: gallery._id,
        storedFilename: saved.storedFilename,
        mimeType,
        watermarkText,
        applyWatermark: applyPreviewWatermark,
    })

    return photo
}

export const listGalleryUploads = async (req, res) => {
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

        const rows = await GalleryPhoto.find(filter).sort(GALLERY_MEDIA_SORT).exec()
        return res.status(200).json({
            photos: rows.map(formatGalleryPhotoResponse),
        })
    } catch (error) {
        console.error("listGalleryUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const presignGalleryPhotoUploads = async (req, res) => {
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
            const err = validateGalleryPhotoMeta(file)
            if (err) {
                return res.status(400).json({ message: err })
            }

            try {
                const presigned = await createGalleryPhotoPresignedUpload({
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
        console.error("presignGalleryPhotoUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const completeGalleryPhotoUploads = async (req, res) => {
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
            const err = validateGalleryPhotoMeta(file)
            if (err) {
                return res.status(400).json({ message: err })
            }
            const verifyErr = await verifyGalleryPhotoInStorage({
                galleryId: gallery._id,
                storedFilename: file.storedFilename,
                mimeType: file.mimeType,
                sizeBytes: file.sizeBytes,
            })
            if (verifyErr) {
                return res.status(400).json({ message: verifyErr })
            }
        }

        const onConflict = parseOnConflict(
            req.body?.onConflict ?? req.body?.on_conflict ?? req.query.onConflict
        )

        const setResolved = await resolveGallerySetIdForUpload(gallery._id, req.body)
        if (setResolved.error) {
            return res.status(400).json({ message: setResolved.error })
        }
        const uploadSetId = setResolved.setId
        const applyPreviewWatermark = parseApplyPreviewWatermark(req.body, gallery)
        const watermarkText = resolveWatermarkPreviewText(req.user?.studio)

        const existing = await GalleryPhoto.find({
            gallery: gallery._id,
            deletedAt: null,
        }).select("originalFilename _id storedFilename url")

        const byName = new Map(
            existing.map((p) => [p.originalFilename.toLowerCase(), p])
        )

        const conflicts = []
        const toUpload = []

        for (const file of parsed.files) {
            const name = file.originalFilename?.trim() || "upload.jpg"
            const key = name.toLowerCase()
            const hit = byName.get(key)

            if (hit) {
                conflicts.push({ filename: name, existingId: String(hit._id) })
                if (onConflict === "cancel") {
                    return res.status(409).json({
                        message: "Upload cancelled due to duplicate filename",
                        conflicts,
                    })
                }
                if (onConflict === "skip") continue
                toUpload.push({ directMeta: file, replace: hit })
            } else {
                toUpload.push({ directMeta: file, replace: null })
            }
        }

        if (onConflict === "cancel" && conflicts.length) {
            return res.status(409).json({
                message: "Duplicate filenames detected",
                conflicts,
            })
        }

        const created = []
        const replaced = []
        const skipped =
            onConflict === "skip" ? conflicts.map((c) => c.filename) : []

        let nextSortOrder = await getNextGalleryMediaSortOrder(
            GalleryPhoto,
            gallery._id
        )

        for (const item of toUpload) {
            const { directMeta, replace } = item
            const isVideo = directMeta.mimeType?.startsWith("video/")

            if (replace) {
                const row = await persistGalleryPhotoWithDerivatives({
                    gallery,
                    file: null,
                    directMeta: { ...directMeta, isVideo },
                    replace,
                    uploadSetId,
                    ownerId: req.user._id,
                    applyPreviewWatermark,
                    watermarkText,
                })
                replaced.push(
                    formatGalleryPhotoResponse(row, {
                        watermarkPreviewEnabled: applyPreviewWatermark,
                    })
                )
            } else {
                const row = await persistGalleryPhotoWithDerivatives({
                    gallery,
                    file: null,
                    directMeta: { ...directMeta, isVideo },
                    replace: null,
                    uploadSetId,
                    ownerId: req.user._id,
                    applyPreviewWatermark,
                    watermarkText,
                    nextSortOrder,
                })
                nextSortOrder += 1
                created.push(
                    formatGalleryPhotoResponse(row, {
                        watermarkPreviewEnabled: applyPreviewWatermark,
                    })
                )
                byName.set(
                    (directMeta.originalFilename?.trim() || "upload.jpg").toLowerCase(),
                    row
                )
            }
        }

        return res.status(201).json({
            message: "Upload complete",
            created,
            replaced,
            skipped,
            conflicts: conflicts.length ? conflicts : undefined,
        })
    } catch (error) {
        console.error("completeGalleryPhotoUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const uploadGalleryPhotos = async (req, res) => {
    try {
        if (s3Configured()) {
            return res.status(400).json({
                message:
                    "Server-side upload is disabled when S3 is configured. Use POST /api/galleries/:id/uploads/presign then POST /api/galleries/:id/uploads/complete",
            })
        }

        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const files = req.files ?? []
        if (!files.length) {
            return res.status(400).json({ message: "No files provided" })
        }

        const onConflict = parseOnConflict(
            req.body?.onConflict ?? req.body?.on_conflict ?? req.query.onConflict
        )

        const setResolved = await resolveGallerySetIdForUpload(gallery._id, req.body)
        if (setResolved.error) {
            return res.status(400).json({ message: setResolved.error })
        }
        const uploadSetId = setResolved.setId
        const applyPreviewWatermark = parseApplyPreviewWatermark(req.body, gallery)
        const watermarkText = resolveWatermarkPreviewText(req.user?.studio)

        const existing = await GalleryPhoto.find({
            gallery: gallery._id,
            deletedAt: null,
        }).select("originalFilename _id storedFilename url")

        const byName = new Map(
            existing.map((p) => [p.originalFilename.toLowerCase(), p])
        )

        const conflicts = []
        const toUpload = []

        for (const file of files) {
            const err = validateGalleryPhotoFile(file)
            if (err) {
                return res.status(400).json({ message: err })
            }

            const name = file.originalname?.trim() || "upload.jpg"
            const key = name.toLowerCase()
            const hit = byName.get(key)

            if (hit) {
                conflicts.push({ filename: name, existingId: String(hit._id) })
                if (onConflict === "cancel") {
                    return res.status(409).json({
                        message: "Upload cancelled due to duplicate filename",
                        conflicts,
                    })
                }
                if (onConflict === "skip") continue
                toUpload.push({ file, replace: hit })
            } else {
                toUpload.push({ file, replace: null })
            }
        }

        if (onConflict === "cancel" && conflicts.length) {
            return res.status(409).json({
                message: "Duplicate filenames detected",
                conflicts,
            })
        }

        const created = []
        const replaced = []
        const skipped =
            onConflict === "skip" ? conflicts.map((c) => c.filename) : []

        let nextSortOrder = await getNextGalleryMediaSortOrder(
            GalleryPhoto,
            gallery._id
        )

        for (const item of toUpload) {
            const { file, replace } = item

            if (replace) {
                const row = await persistGalleryPhotoWithDerivatives({
                    gallery,
                    file,
                    replace,
                    uploadSetId,
                    ownerId: req.user._id,
                    applyPreviewWatermark,
                    watermarkText,
                })
                replaced.push(
                    formatGalleryPhotoResponse(row, {
                        watermarkPreviewEnabled: applyPreviewWatermark,
                    })
                )
            } else {
                const row = await persistGalleryPhotoWithDerivatives({
                    gallery,
                    file,
                    replace: null,
                    uploadSetId,
                    ownerId: req.user._id,
                    applyPreviewWatermark,
                    watermarkText,
                    nextSortOrder,
                })
                nextSortOrder += 1
                created.push(
                    formatGalleryPhotoResponse(row, {
                        watermarkPreviewEnabled: applyPreviewWatermark,
                    })
                )
                byName.set(
                    (file.originalname?.trim() || "upload.jpg").toLowerCase(),
                    row
                )
            }
        }

        return res.status(201).json({
            message: "Upload complete",
            created,
            replaced,
            skipped,
            conflicts: conflicts.length ? conflicts : undefined,
        })
    } catch (error) {
        console.error("uploadGalleryPhotos:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteGalleryPhoto = async (req, res) => {
    try {
        const { id, photoId } = req.params
        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({ message: "Invalid photo id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const photo = await GalleryPhoto.findOne({
            _id: photoId,
            gallery: gallery._id,
            deletedAt: null,
        })

        if (!photo) {
            return res.status(404).json({ message: "Photo not found" })
        }

        const now = new Date()
        photo.deletedAt = now
        photo.restoreDeadline = computeRestoreDeadline(now)
        await photo.save()

        return res.status(200).json({
            message: "Photo moved to trash",
            photo: formatGalleryPhotoResponse(photo),
        })
    } catch (error) {
        console.error("deleteGalleryPhoto:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const restoreGalleryPhoto = async (req, res) => {
    try {
        const { id, photoId } = req.params
        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({ message: "Invalid photo id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const photo = await GalleryPhoto.findOne({
            _id: photoId,
            gallery: gallery._id,
            deletedAt: { $ne: null },
        })

        if (!photo) {
            return res.status(404).json({ message: "Photo not found in trash" })
        }

        if (isRestoreExpired(effectiveRestoreDeadline(photo))) {
            return res.status(410).json({ message: "Restore deadline has passed" })
        }

        photo.deletedAt = null
        photo.restoreDeadline = null
        photo.sortOrder = await getNextGalleryMediaSortOrder(
            GalleryPhoto,
            gallery._id
        )
        await photo.save()

        return res.status(200).json({
            message: "Photo restored",
            photo: formatGalleryPhotoResponse(photo),
        })
    } catch (error) {
        console.error("restoreGalleryPhoto:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const bulkDeleteGalleryPhotos = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const all = req.body?.all === true || req.body?.all === "true"
        const ids = Array.isArray(req.body?.photoIds)
            ? req.body.photoIds.filter((x) => mongoose.isValidObjectId(x))
            : []

        if (!all && !ids.length) {
            return res.status(400).json({
                message: "Provide photoIds array or all: true",
            })
        }

        const filter = { gallery: gallery._id, deletedAt: null }
        if (!all) filter._id = { $in: ids }

        const now = new Date()
        const deadline = computeRestoreDeadline(now)

        const result = await GalleryPhoto.updateMany(filter, {
            $set: { deletedAt: now, restoreDeadline: deadline },
        })

        return res.status(200).json({
            message: "Photos moved to trash",
            count: result.modifiedCount ?? result.nModified ?? 0,
        })
    } catch (error) {
        console.error("bulkDeleteGalleryPhotos:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const reorderGalleryUploads = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const photoIds = parseReorderIdList(req.body, "photoIds", "photo_ids")
        const active = await GalleryPhoto.find({
            gallery: gallery._id,
            deletedAt: null,
        })
            .select("_id")
            .lean()

        const error = validateGalleryReorderIds(photoIds, active, "photoIds")
        if (error) {
            return res.status(400).json({ message: error })
        }

        await persistGalleryMediaReorder(GalleryPhoto, gallery._id, photoIds)

        return res.status(200).json({ message: "Order saved" })
    } catch (error) {
        console.error("reorderGalleryUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
