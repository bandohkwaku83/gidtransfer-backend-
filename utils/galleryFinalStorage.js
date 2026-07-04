import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import {
    MAX_GALLERY_VIDEO_BYTES,
    extensionForGalleryMediaMime,
    galleryMediaValidationError,
    isAllowedGalleryMediaMime,
    isGalleryVideoMime,
    validateGalleryMediaFileSize,
    maxGalleryMediaBytesForMime,
} from "./galleryMediaTypes.js"
import {
    s3Configured,
    objectKey,
    publicObjectUrl,
    createPresignedPutUrl,
    uploadBuffer,
    headObject,
    deleteObjects,
} from "./s3Storage.js"

export const MAX_GALLERY_FINAL_BYTES = MAX_GALLERY_VIDEO_BYTES

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const GALLERY_FINALS_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "gallery-finals"
)

export const GALLERY_FINALS_S3_PREFIX = "gallery-finals"

export const galleryFinalObjectKey = (galleryId, storedFilename) =>
    objectKey(GALLERY_FINALS_S3_PREFIX, String(galleryId), storedFilename)

export const ensureGalleryFinalsDir = (galleryId) => {
    const dir = path.join(GALLERY_FINALS_DIR, String(galleryId))
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

export const validateGalleryFinalFile = (file) => {
    if (!file) return "No file provided"
    if (!isAllowedGalleryMediaMime(file.mimetype)) {
        return galleryMediaValidationError()
    }
    const sizeError = validateGalleryMediaFileSize(file)
    if (sizeError) return sizeError
    return null
}

export const validateGalleryFinalMeta = ({ mimeType, sizeBytes }) => {
    if (!mimeType || !isAllowedGalleryMediaMime(mimeType)) {
        return galleryMediaValidationError()
    }
    const maxBytes = maxGalleryMediaBytesForMime(mimeType)
    if (maxBytes > 0 && sizeBytes > maxBytes) {
        return validateGalleryMediaFileSize({ mimetype: mimeType, size: sizeBytes })
    }
    return null
}

export const relativeGalleryFinalUrl = (galleryId, filename) =>
    `/uploads/gallery-finals/${galleryId}/${filename}`

export const galleryFinalPublicUrl = (galleryId, storedFilename) => {
    if (!storedFilename) return null
    if (s3Configured()) {
        return publicObjectUrl(galleryFinalObjectKey(galleryId, storedFilename))
    }
    return relativeGalleryFinalUrl(galleryId, storedFilename)
}

export const deleteGalleryFinalFile = (galleryId, storedFilename) => {
    if (!galleryId || !storedFilename) return
    if (s3Configured()) {
        deleteObjects([galleryFinalObjectKey(galleryId, storedFilename)])
        return
    }
    const fullPath = path.join(
        GALLERY_FINALS_DIR,
        String(galleryId),
        storedFilename
    )
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore */
    }
}

export const saveGalleryFinalFile = async (galleryId, file) => {
    const ext = extensionForGalleryMediaMime(file.mimetype)
    const storedFilename = `${crypto.randomUUID()}${ext}`

    if (s3Configured()) {
        const key = galleryFinalObjectKey(galleryId, storedFilename)
        const url = await uploadBuffer(key, file.buffer, file.mimetype)
        return {
            storedFilename,
            url,
            isVideo: isGalleryVideoMime(file.mimetype),
        }
    }

    ensureGalleryFinalsDir(galleryId)
    const dest = path.join(GALLERY_FINALS_DIR, String(galleryId), storedFilename)
    await fs.promises.writeFile(dest, file.buffer)
    return {
        storedFilename,
        url: relativeGalleryFinalUrl(galleryId, storedFilename),
        isVideo: isGalleryVideoMime(file.mimetype),
    }
}

export const createGalleryFinalPresignedUpload = async ({
    galleryId,
    mimeType,
    sizeBytes,
}) => {
    const err = validateGalleryFinalMeta({ mimeType, sizeBytes })
    if (err) throw new Error(err)

    const ext = extensionForGalleryMediaMime(mimeType)
    const storedFilename = `${crypto.randomUUID()}${ext}`
    const key = galleryFinalObjectKey(galleryId, storedFilename)
    const uploadId = crypto.randomUUID()

    const presigned = await createPresignedPutUrl(key, {
        contentType: mimeType,
        contentLength: sizeBytes,
    })

    return {
        uploadId,
        storedFilename,
        key,
        ...presigned,
        isVideo: isGalleryVideoMime(mimeType),
    }
}

export const verifyGalleryFinalInStorage = async ({
    galleryId,
    storedFilename,
    mimeType,
    sizeBytes,
}) => {
    if (s3Configured()) {
        const key = galleryFinalObjectKey(galleryId, storedFilename)
        const meta = await headObject(key)
        if (!meta) return "Upload not found in storage — complete the S3 upload first"
        if (sizeBytes != null && meta.contentLength !== sizeBytes) {
            return "Uploaded file size does not match"
        }
        if (mimeType && meta.contentType && meta.contentType !== mimeType) {
            return "Uploaded file type does not match"
        }
        return null
    }

    const fullPath = path.join(GALLERY_FINALS_DIR, String(galleryId), storedFilename)
    if (!fs.existsSync(fullPath)) {
        return "Upload not found in storage"
    }
    if (sizeBytes != null) {
        const stat = fs.statSync(fullPath)
        if (stat.size !== sizeBytes) return "Uploaded file size does not match"
    }
    return null
}
