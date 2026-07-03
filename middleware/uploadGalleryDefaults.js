import multer from "multer"
import {
    galleryDefaultCoverSizeErrorMessage,
    MAX_GALLERY_DEFAULT_COVER_BYTES,
} from "../utils/galleryDefaultCoverStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_GALLERY_DEFAULT_COVER_BYTES,
        files: 1,
    },
})

/** Accept common client field names for the default cover upload. */
export const uploadGalleryDefaultCover = upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "defaultCover", maxCount: 1 },
    { name: "default_cover", maxCount: 1 },
])

export const galleryDefaultsUploadedCover = (req) =>
    req.files?.cover?.[0] ??
    req.files?.defaultCover?.[0] ??
    req.files?.default_cover?.[0] ??
    null

export const handleUploadGalleryDefaultCover = (req, res, next) => {
    uploadGalleryDefaultCover(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: galleryDefaultCoverSizeErrorMessage(),
            })
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                message:
                    "Cover upload must use form field cover, defaultCover, or default_cover",
            })
        }
        return res.status(400).json({
            message: err.message || "Invalid cover upload",
        })
    })
}
