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
    s3PublicReadsViaDirectUrl,
    objectKey,
    publicObjectUrl,
    createPresignedPutUrl,
    uploadBuffer,
    headObject,
    deleteObjects,
} from "./s3Storage.js"

export const MAX_GALLERY_PHOTO_BYTES = MAX_GALLERY_VIDEO_BYTES

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const GALLERY_PHOTOS_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "gallery-photos"
)

export const GALLERY_PHOTOS_S3_PREFIX = "gallery-photos"

export const galleryPhotoObjectKey = (galleryId, storedFilename) =>
    objectKey(GALLERY_PHOTOS_S3_PREFIX, String(galleryId), storedFilename)

export const ensureGalleryPhotosDir = (galleryId) => {
    const dir = path.join(GALLERY_PHOTOS_DIR, String(galleryId))
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

export const validateGalleryPhotoFile = (file) => {
    if (!file) return "No file provided"
    if (!isAllowedGalleryMediaMime(file.mimetype)) {
        return galleryMediaValidationError()
    }
    const sizeError = validateGalleryMediaFileSize(file)
    if (sizeError) return sizeError
    return null
}

export const validateGalleryPhotoMeta = ({ mimeType, sizeBytes }) => {
    if (!mimeType || !isAllowedGalleryMediaMime(mimeType)) {
        return galleryMediaValidationError()
    }
    const maxBytes = maxGalleryMediaBytesForMime(mimeType)
    if (maxBytes > 0 && sizeBytes > maxBytes) {
        return validateGalleryMediaFileSize({ mimetype: mimeType, size: sizeBytes })
    }
    return null
}

export const relativeGalleryPhotoUrl = (galleryId, filename) =>
    `/uploads/gallery-photos/${galleryId}/${filename}`

/** Resolve a photo URL for API responses (CDN when configured, else API /uploads proxy or local disk). */
export const galleryPhotoPublicUrl = (galleryId, storedFilename) => {
    if (!storedFilename) return null
    const relative = relativeGalleryPhotoUrl(galleryId, storedFilename)
    if (s3Configured() && s3PublicReadsViaDirectUrl()) {
        return publicObjectUrl(galleryPhotoObjectKey(galleryId, storedFilename))
    }
    return relative
}

export const deleteGalleryPhotoFile = (galleryId, storedFilename) => {
    if (!galleryId || !storedFilename) return
    if (s3Configured()) {
        deleteObjects([galleryPhotoObjectKey(galleryId, storedFilename)])
        return
    }
    const fullPath = path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore */
    }
}

/** Remove original plus any known preview/thumbnail derivatives. */
export const deleteGalleryPhotoAssets = (galleryId, photo) => {
    if (!galleryId || !photo) return
    deleteGalleryPhotoFile(galleryId, photo.storedFilename)
    if (photo.thumbStoredFilename) {
        deleteGalleryPhotoFile(galleryId, photo.thumbStoredFilename)
    }
    if (photo.previewWmStoredFilename) {
        deleteGalleryPhotoFile(galleryId, photo.previewWmStoredFilename)
    }
}

export const saveGalleryPhotoFile = async (galleryId, file) => {
    const ext = extensionForGalleryMediaMime(file.mimetype)
    const storedFilename = `${crypto.randomUUID()}${ext}`

    if (s3Configured()) {
        const key = galleryPhotoObjectKey(galleryId, storedFilename)
        const url = await uploadBuffer(key, file.buffer, file.mimetype)
        return {
            storedFilename,
            url,
            isVideo: isGalleryVideoMime(file.mimetype),
        }
    }

    ensureGalleryPhotosDir(galleryId)
    const dest = path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)
    await fs.promises.writeFile(dest, file.buffer)
    return {
        storedFilename,
        url: relativeGalleryPhotoUrl(galleryId, storedFilename),
        isVideo: isGalleryVideoMime(file.mimetype),
    }
}

export const createGalleryPhotoPresignedUpload = async ({
    galleryId,
    mimeType,
    sizeBytes,
}) => {
    const err = validateGalleryPhotoMeta({ mimeType, sizeBytes })
    if (err) throw new Error(err)

    const ext = extensionForGalleryMediaMime(mimeType)
    const storedFilename = `${crypto.randomUUID()}${ext}`
    const key = galleryPhotoObjectKey(galleryId, storedFilename)
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
        publicUrl: galleryPhotoPublicUrl(galleryId, storedFilename),
        isVideo: isGalleryVideoMime(mimeType),
    }
}

export const verifyGalleryPhotoInStorage = async ({
    galleryId,
    storedFilename,
    mimeType,
    sizeBytes,
}) => {
    if (s3Configured()) {
        const key = galleryPhotoObjectKey(galleryId, storedFilename)
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

    const fullPath = path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)
    if (!fs.existsSync(fullPath)) {
        return "Upload not found in storage"
    }
    if (sizeBytes != null) {
        const stat = fs.statSync(fullPath)
        if (stat.size !== sizeBytes) return "Uploaded file size does not match"
    }
    return null
}

export const galleryPhotoStoragePath = (galleryId, storedFilename) => {
    if (s3Configured()) return null
    return path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)
}
