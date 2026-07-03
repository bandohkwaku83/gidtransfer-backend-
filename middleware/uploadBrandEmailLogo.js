import multer from "multer"
import { MAX_LOGO_BYTES, logoSizeErrorMessage } from "../utils/studioLogoStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
})

export const uploadBrandEmailLogo = upload.single("logo")

export const handleUploadBrandEmailLogo = (req, res, next) => {
    uploadBrandEmailLogo(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: logoSizeErrorMessage() })
        }
        return res.status(400).json({
            message: err.message || "Invalid logo upload",
        })
    })
}
