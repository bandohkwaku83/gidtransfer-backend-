import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"
import {
    extensionForGalleryMediaMime,
    isGalleryVideoMime,
    mimeMatchesGalleryUploadKind,
    galleryMediaValidationErrorForKind,
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const COLLAB_ASSETS_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "collaboration-assets"
)

export const COLLAB_ASSETS_S3_PREFIX = "collaboration-assets"

export const collaborationAssetObjectKey = (workspaceId, storedFilename) =>
    objectKey(COLLAB_ASSETS_S3_PREFIX, String(workspaceId), storedFilename)

export const ensureCollaborationAssetsDir = (workspaceId) => {
    const dir = path.join(COLLAB_ASSETS_DIR, String(workspaceId))
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

export const validateCollaborationAssetFile = (file, { kind = null } = {}) => {
    if (!file) return "No file provided"
    if (!mimeMatchesGalleryUploadKind(file.mimetype, kind)) {
        return galleryMediaValidationErrorForKind(kind)
    }
    const sizeError = validateGalleryMediaFileSize(file)
    if (sizeError) return sizeError
    return null
}

export const validateCollaborationAssetMeta = (
    { mimeType, sizeBytes },
    { kind = null } = {}
) => {
    if (!mimeType || !mimeMatchesGalleryUploadKind(mimeType, kind)) {
        return galleryMediaValidationErrorForKind(kind)
    }
    const maxBytes = maxGalleryMediaBytesForMime(mimeType)
    if (maxBytes > 0 && sizeBytes > maxBytes) {
        return validateGalleryMediaFileSize({
            mimetype: mimeType,
            size: sizeBytes,
        })
    }
    return null
}

export const relativeCollaborationAssetUrl = (workspaceId, filename) =>
    `/uploads/collaboration-assets/${workspaceId}/${filename}`

export const collaborationAssetPublicUrl = (workspaceId, storedFilename) => {
    if (!storedFilename) return null
    const relative = relativeCollaborationAssetUrl(workspaceId, storedFilename)
    if (s3Configured() && s3PublicReadsViaDirectUrl()) {
        return publicObjectUrl(
            collaborationAssetObjectKey(workspaceId, storedFilename)
        )
    }
    return relative
}

export const deleteCollaborationAssetFile = (workspaceId, storedFilename) => {
    if (!workspaceId || !storedFilename) return
    if (s3Configured()) {
        deleteObjects([
            collaborationAssetObjectKey(workspaceId, storedFilename),
        ])
        return
    }
    const fullPath = path.join(
        COLLAB_ASSETS_DIR,
        String(workspaceId),
        storedFilename
    )
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore */
    }
}

export const deleteCollaborationAssetFiles = (workspaceId, asset) => {
    if (!workspaceId || !asset) return
    deleteCollaborationAssetFile(workspaceId, asset.storedFilename)
    if (asset.thumbStoredFilename) {
        deleteCollaborationAssetFile(workspaceId, asset.thumbStoredFilename)
    }
    if (asset.previewStoredFilename) {
        deleteCollaborationAssetFile(workspaceId, asset.previewStoredFilename)
    }
}

export const saveCollaborationAssetFile = async (workspaceId, file) => {
    const ext = extensionForGalleryMediaMime(file.mimetype)
    const storedFilename = `${crypto.randomUUID()}${ext}`

    if (s3Configured()) {
        const key = collaborationAssetObjectKey(workspaceId, storedFilename)
        const url = await uploadBuffer(key, file.buffer, file.mimetype)
        return {
            storedFilename,
            url,
            isVideo: isGalleryVideoMime(file.mimetype),
        }
    }

    ensureCollaborationAssetsDir(workspaceId)
    const dest = path.join(
        COLLAB_ASSETS_DIR,
        String(workspaceId),
        storedFilename
    )
    await fs.promises.writeFile(dest, file.buffer)
    return {
        storedFilename,
        url: relativeCollaborationAssetUrl(workspaceId, storedFilename),
        isVideo: isGalleryVideoMime(file.mimetype),
    }
}

export const createCollaborationAssetPresignedUpload = async ({
    workspaceId,
    mimeType,
    sizeBytes,
}) => {
    const err = validateCollaborationAssetMeta({ mimeType, sizeBytes })
    if (err) throw new Error(err)

    const ext = extensionForGalleryMediaMime(mimeType)
    const storedFilename = `${crypto.randomUUID()}${ext}`
    const key = collaborationAssetObjectKey(workspaceId, storedFilename)
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
        publicUrl: collaborationAssetPublicUrl(workspaceId, storedFilename),
        isVideo: isGalleryVideoMime(mimeType),
    }
}

export const verifyCollaborationAssetInStorage = async ({
    workspaceId,
    storedFilename,
    mimeType,
    sizeBytes,
}) => {
    if (s3Configured()) {
        const key = collaborationAssetObjectKey(workspaceId, storedFilename)
        const meta = await headObject(key)
        if (!meta) {
            return "Upload not found in storage — complete the S3 upload first"
        }
        if (sizeBytes != null && meta.contentLength !== sizeBytes) {
            return "Uploaded file size does not match"
        }
        if (mimeType && meta.contentType && meta.contentType !== mimeType) {
            return "Uploaded file type does not match"
        }
        return null
    }

    const fullPath = path.join(
        COLLAB_ASSETS_DIR,
        String(workspaceId),
        storedFilename
    )
    if (!fs.existsSync(fullPath)) {
        return "Upload not found in storage"
    }
    if (sizeBytes != null) {
        const stat = fs.statSync(fullPath)
        if (stat.size !== sizeBytes) return "Uploaded file size does not match"
    }
    return null
}
