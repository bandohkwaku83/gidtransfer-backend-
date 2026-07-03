import multer from "multer"
import {
    MAX_GALLERY_BATCH_FILES,
    MAX_GALLERY_VIDEO_BYTES,
    galleryUploadBatchLimitMessage,
    galleryUploadSizeLimitMessage,
} from "../utils/galleryMediaTypes.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_GALLERY_VIDEO_BYTES,
        files: MAX_GALLERY_BATCH_FILES,
    },
})

export const uploadGalleryPhotosMw = upload.array("photos", MAX_GALLERY_BATCH_FILES)

export const handleGalleryPhotosUpload = (req, res, next) => {
    uploadGalleryPhotosMw(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: galleryUploadSizeLimitMessage })
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({ message: galleryUploadBatchLimitMessage() })
        }
        return res.status(400).json({
            message: err.message || "Invalid photo upload",
        })
    })
}
