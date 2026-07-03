/** Shared image + video rules for gallery raw uploads and finals. */
export const MAX_GALLERY_IMAGE_BYTES = 100 * 1024 * 1024 // 100 MiB
export const MAX_GALLERY_VIDEO_BYTES = 1024 ** 4 // 1 TiB
export const MAX_GALLERY_BATCH_FILES = 700

/** Multer fileSize ceiling — largest allowed single file (video). */
export const MAX_GALLERY_MEDIA_BYTES = MAX_GALLERY_VIDEO_BYTES

export const GALLERY_IMAGE_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
])

export const GALLERY_VIDEO_MIME = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-msvideo",
    "video/ogg",
])

export const isGalleryVideoMime = (mime) => GALLERY_VIDEO_MIME.has(mime)

export const isGalleryImageMime = (mime) => GALLERY_IMAGE_MIME.has(mime)

export const isAllowedGalleryMediaMime = (mime) =>
    isGalleryImageMime(mime) || isGalleryVideoMime(mime)

export const extensionForGalleryMediaMime = (mime) => {
    if (mime === "image/png") return ".png"
    if (mime === "image/webp") return ".webp"
    if (mime === "image/gif") return ".gif"
    if (mime === "video/webm") return ".webm"
    if (mime === "video/quicktime") return ".mov"
    if (mime === "video/x-msvideo") return ".avi"
    if (mime === "video/ogg") return ".ogv"
    if (mime === "video/mp4") return ".mp4"
    return ".jpg"
}

export const galleryMediaValidationError = () =>
    "File must be an image (JPG, PNG, WebP, GIF) or video (MP4, MOV, WebM, etc.)"

export const maxGalleryMediaBytesForMime = (mime) => {
    if (isGalleryVideoMime(mime)) return MAX_GALLERY_VIDEO_BYTES
    if (isGalleryImageMime(mime)) return MAX_GALLERY_IMAGE_BYTES
    return 0
}

export const galleryMediaSizeError = (mime) => {
    if (isGalleryVideoMime(mime)) return "Video must be 1TB or smaller"
    if (isGalleryImageMime(mime)) return "Image must be 100MB or smaller"
    return "File exceeds the allowed size"
}

export const galleryUploadSizeLimitMessage =
    "Images must be 100MB or smaller; videos must be 1TB or smaller"

export const galleryUploadBatchLimitMessage = () =>
    `Too many files (max ${MAX_GALLERY_BATCH_FILES} per batch)`

export const validateGalleryMediaFileSize = (file) => {
    if (!file) return null
    const maxBytes = maxGalleryMediaBytesForMime(file.mimetype)
    if (maxBytes > 0 && file.size > maxBytes) {
        return galleryMediaSizeError(file.mimetype)
    }
    return null
}
