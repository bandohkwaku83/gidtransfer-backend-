import mongoose from "mongoose"
import GalleryPhoto from "../models/GalleryPhoto.js"
import {
    formatGalleryPhotoResponse,
    formatGalleryPhotoGridResponse,
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
import { scheduleGalleryVideoDash } from "../utils/galleryVideoQueue.js"
import { userHasFeature } from "../utils/planFeatures.js"
import {
    sendVideoUploadDenied,
    videoBytesFromFiles,
    videoUploadDeniedPayload,
} from "../utils/planVideoUploads.js"
import { resolveWatermarkPreviewText } from "../utils/previewWatermark.js"
import { parseGalleryUploadKind } from "../utils/galleryMediaTypes.js"
import {
    GALLERY_MEDIA_SORT,
    getNextGalleryMediaSortOrder,
    parseReorderIdList,
    persistGalleryMediaReorder,
    validateGalleryReorderIds,
} from "../utils/galleryMediaOrder.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import { isSummaryView } from "../utils/sparseFields.js"
import {
    galleryPhotoSearchHasCriteria,
    parseGalleryPhotoSearchParams,
    scheduleGalleryPhotoIndex,
    scheduleGalleryPhotosReindex,
    searchGalleryPhotos,
} from "../utils/opensearchPhotos.js"
import { orderDocsByIds } from "../utils/opensearchStudio.js"

const parseOnConflict = (value) => {
    const s = String(value ?? "skip").trim().toLowerCase()
    if (s === "replace" || s === "skip" || s === "cancel") return s
    return "skip"
}

/**
 * Resolve photo vs video upload mode.
 * Prefer route-forced kind (`req.uploadKind`), then body/query `mediaType` / `kind`.
 */
const resolveUploadKind = (req, { required = false } = {}) => {
    if (req.uploadKind === "photo" || req.uploadKind === "video") {
        return req.uploadKind
    }
    const raw =
        req.body?.mediaType ??
        req.body?.media_type ??
        req.body?.kind ??
        req.body?.uploadKind ??
        req.body?.upload_kind ??
        req.query?.mediaType ??
        req.query?.kind
    const kind = parseGalleryUploadKind(raw)
    if (required && !kind) {
        return {
            error:
                "mediaType is required: use \"photo\" or \"video\" (or call /uploads/photos or /uploads/videos)",
        }
    }
    return kind
}

const withUploadKind = (kind) => (req, _res, next) => {
    req.uploadKind = kind
    next()
}

export { withUploadKind }

const denyVideoUploadIfNeeded = async (req, res, files, replacingBytes = 0) => {
    const incoming = videoBytesFromFiles(files)
    if (incoming <= 0) return false
    const denied = await videoUploadDeniedPayload(req.user, incoming, {
        replacingBytes,
    })
    if (!denied) return false
    sendVideoUploadDenied(res, denied)
    return true
}

const s3UploadHintForKind = (kind) => {
    if (kind === "photo") {
        return "Server-side upload is disabled when S3 is configured. Use POST /api/galleries/:id/uploads/photos/presign then POST /api/galleries/:id/uploads/photos/complete"
    }
    if (kind === "video") {
        return "Server-side upload is disabled when S3 is configured. Use POST /api/galleries/:id/uploads/videos/presign then POST /api/galleries/:id/uploads/videos/complete"
    }
    return "Server-side upload is disabled when S3 is configured. Use POST /api/galleries/:id/uploads/presign then POST /api/galleries/:id/uploads/complete"
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
    enableDash = false,
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
        replace.posterStoredFilename = null
        replace.dashManifestStoredFilename = null
        replace.dashStatus = saved.isVideo
            ? enableDash
                ? "pending"
                : "skipped"
            : null
        replace.dashError = null
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
        if (enableDash) {
            scheduleGalleryVideoDash({
                kind: "photo",
                mediaId: replace._id,
                galleryId: gallery._id,
                storedFilename: saved.storedFilename,
                mimeType,
                sizeBytes,
                isVideo: saved.isVideo,
            })
        }
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
        dashStatus: saved.isVideo ? (enableDash ? "pending" : "skipped") : null,
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
    if (enableDash) {
        scheduleGalleryVideoDash({
            kind: "photo",
            mediaId: photo._id,
            galleryId: gallery._id,
            storedFilename: saved.storedFilename,
            mimeType,
            sizeBytes,
            isVideo: saved.isVideo,
        })
    }
    scheduleGalleryPhotoIndex(photo)

    return photo
}

export const listGalleryUploads = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const searchParams = parseGalleryPhotoSearchParams(req.query)
        const useSearch = galleryPhotoSearchHasCriteria(searchParams)

        const includeTrash = searchParams.includeTrash
        const filter = { gallery: gallery._id }
        if (!includeTrash) {
            filter.deletedAt = null
        }

        const listKind = parseGalleryUploadKind(
            req.query.mediaType ?? req.query.kind ?? req.query.type
        )
        if (listKind === "photo") {
            filter.isVideo = { $ne: true }
        } else if (listKind === "video") {
            filter.isVideo = true
        }

        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 500,
        })

        const gridView =
            isSummaryView(req.query) ||
            String(req.query.view ?? "").trim().toLowerCase() === "grid"
        const photoOptions = { absoluteUrls: true }
        const formatPhoto = gridView
            ? (row) => formatGalleryPhotoGridResponse(row, photoOptions)
            : (row) =>
                  formatGalleryPhotoResponse(row, {
                      ...photoOptions,
                      includeAi: useSearch,
                  })

        if (useSearch) {
            const hit = await searchGalleryPhotos(gallery._id, req.query, {
                skip: pagination.skip,
                limit: pagination.limit,
            })
            const rows =
                hit.ids.length > 0
                    ? await GalleryPhoto.find({
                          _id: { $in: hit.ids },
                          gallery: gallery._id,
                      }).exec()
                    : []
            const ordered = orderDocsByIds(rows, hit.ids)

            return res.status(200).json({
                photos: ordered.map((row) => formatPhoto(row)),
                pagination: buildPaginationMeta({
                    ...pagination,
                    total: hit.total,
                }),
                view: gridView ? "grid" : "full",
                ...(listKind ? { mediaType: listKind } : {}),
                search: {
                    engine: hit.engine,
                    q: searchParams.q ?? null,
                    filters: {
                        scene: searchParams.scene ?? null,
                        tags: searchParams.tags ?? null,
                        suggested: searchParams.suggested ?? null,
                        blurry: searchParams.isBlurry ?? null,
                        eyesOpen: searchParams.eyesOpen ?? null,
                        minQuality: searchParams.minQuality ?? null,
                        maxQuality: searchParams.maxQuality ?? null,
                        mediaType: listKind,
                    },
                },
            })
        }

        const [total, rows] = await Promise.all([
            GalleryPhoto.countDocuments(filter),
            paginatedQuery(
                GalleryPhoto.find(filter).sort(GALLERY_MEDIA_SORT),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            photos: rows.map((row) => formatPhoto(row)),
            pagination: buildPaginationMeta({ ...pagination, total }),
            view: gridView ? "grid" : "full",
            ...(listKind ? { mediaType: listKind } : {}),
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
            const err = validateGalleryPhotoMeta(file, { kind: uploadKind })
            if (err) {
                return res.status(400).json({ message: err })
            }
        }

        if (await denyVideoUploadIfNeeded(req, res, parsed.files)) {
            return
        }

        const uploads = await Promise.all(
            parsed.files.map(async (file) => {
                try {
                    const presigned = await createGalleryPhotoPresignedUpload({
                        galleryId: gallery._id,
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
                    message: "Each file must include storedFilename from presign response",
                })
            }
            const err = validateGalleryPhotoMeta(file, { kind: uploadKind })
            if (err) {
                return res.status(400).json({ message: err })
            }
        }

        if (await denyVideoUploadIfNeeded(req, res, parsed.files)) {
            return
        }

        const verifyResults = await Promise.all(
            parsed.files.map(async (file) => ({
                file,
                verifyErr: await verifyGalleryPhotoInStorage({
                    galleryId: gallery._id,
                    storedFilename: file.storedFilename,
                    mimeType: file.mimeType,
                    sizeBytes: file.sizeBytes,
                }),
            }))
        )
        const failedVerify = verifyResults.find((result) => result.verifyErr)
        if (failedVerify) {
            return res.status(400).json({ message: failedVerify.verifyErr })
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
        }).select("originalFilename _id storedFilename url isVideo sizeBytes")

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

        const replacingBytes = toUpload.reduce((sum, item) => {
            if (item.replace?.isVideo) {
                return sum + Number(item.replace.sizeBytes ?? 0)
            }
            return sum
        }, 0)
        if (await denyVideoUploadIfNeeded(req, res, parsed.files, replacingBytes)) {
            return
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
                    enableDash: userHasFeature(req.user, "videoDash"),
                })
                replaced.push(
                    formatGalleryPhotoResponse(row, {
                        absoluteUrls: true,
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
                    enableDash: userHasFeature(req.user, "videoDash"),
                })
                nextSortOrder += 1
                created.push(
                    formatGalleryPhotoResponse(row, {
                        absoluteUrls: true,
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
            ...(uploadKind ? { mediaType: uploadKind } : {}),
        })
    } catch (error) {
        console.error("completeGalleryPhotoUploads:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const uploadGalleryPhotos = async (req, res) => {
    try {
        const kindResolved = resolveUploadKind(req)
        if (kindResolved?.error) {
            return res.status(400).json({ message: kindResolved.error })
        }
        const uploadKind = kindResolved

        if (s3Configured()) {
            return res.status(400).json({
                message: s3UploadHintForKind(uploadKind),
            })
        }

        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const files = req.files ?? []
        if (!files.length) {
            return res.status(400).json({
                message:
                    uploadKind === "video"
                        ? "No videos provided (multipart field: videos)"
                        : uploadKind === "photo"
                          ? "No photos provided (multipart field: photos)"
                          : "No files provided",
            })
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
        }).select("originalFilename _id storedFilename url isVideo sizeBytes")

        const byName = new Map(
            existing.map((p) => [p.originalFilename.toLowerCase(), p])
        )

        const conflicts = []
        const toUpload = []

        for (const file of files) {
            const err = validateGalleryPhotoFile(file, { kind: uploadKind })
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

        const replacingBytes = toUpload.reduce((sum, item) => {
            if (item.replace?.isVideo) {
                return sum + Number(item.replace.sizeBytes ?? 0)
            }
            return sum
        }, 0)
        if (await denyVideoUploadIfNeeded(req, res, files, replacingBytes)) {
            return
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
                    enableDash: userHasFeature(req.user, "videoDash"),
                })
                replaced.push(
                    formatGalleryPhotoResponse(row, {
                        absoluteUrls: true,
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
                    enableDash: userHasFeature(req.user, "videoDash"),
                })
                nextSortOrder += 1
                created.push(
                    formatGalleryPhotoResponse(row, {
                        absoluteUrls: true,
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
            ...(uploadKind ? { mediaType: uploadKind } : {}),
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
        scheduleGalleryPhotoIndex(photo)

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
        scheduleGalleryPhotoIndex(photo)

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
        scheduleGalleryPhotosReindex(gallery._id)

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
