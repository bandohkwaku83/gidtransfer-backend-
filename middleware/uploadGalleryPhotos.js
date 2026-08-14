import multer from "multer"
import {
    MAX_GALLERY_BATCH_FILES,
    MAX_GALLERY_IMAGE_BYTES,
    MAX_GALLERY_VIDEO_BYTES,
    galleryUploadBatchLimitMessage,
    galleryUploadSizeLimitMessage,
} from "../utils/galleryMediaTypes.js"

const storage = multer.memoryStorage()

const photosUpload = multer({
    storage,
    limits: {
        fileSize: MAX_GALLERY_IMAGE_BYTES,
        files: MAX_GALLERY_BATCH_FILES,
    },
})

/** Legacy mixed photo+video field (`photos`) — large ceiling for videos. */
const mixedUpload = multer({
    storage,
    limits: {
        fileSize: MAX_GALLERY_VIDEO_BYTES,
        files: MAX_GALLERY_BATCH_FILES,
    },
})

export const uploadGalleryPhotosMw = photosUpload.array(
    "photos",
    MAX_GALLERY_BATCH_FILES
)

export const uploadGalleryMediaMw = mixedUpload.array(
    "photos",
    MAX_GALLERY_BATCH_FILES
)

/** Photos-only endpoint (`POST .../uploads/photos`). */
export const handleGalleryPhotosUpload = (req, res, next) => {
    uploadGalleryPhotosMw(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: "Images must be 100MB or smaller",
            })
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({ message: galleryUploadBatchLimitMessage() })
        }
        return res.status(400).json({
            message: err.message || "Invalid photo upload",
        })
    })
}

/** Legacy mixed endpoint (`POST .../uploads`) — images + videos on field `photos`. */
export const handleGalleryMediaUpload = (req, res, next) => {
    uploadGalleryMediaMw(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: galleryUploadSizeLimitMessage })
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({ message: galleryUploadBatchLimitMessage() })
        }
        return res.status(400).json({
            message: err.message || "Invalid media upload",
        })
    })
}
