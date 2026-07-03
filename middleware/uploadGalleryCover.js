import multer from "multer"
import { MAX_GALLERY_COVER_BYTES } from "../utils/galleryCoverStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: { fileSize: MAX_GALLERY_COVER_BYTES, files: 1 },
})

export const uploadGalleryCoverMw = upload.single("cover")

export const handleGalleryCoverUpload = (req, res, next) => {
    uploadGalleryCoverMw(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: "Cover must be 5MB or smaller" })
        }
        return res.status(400).json({
            message: err.message || "Invalid cover upload",
        })
    })
}
