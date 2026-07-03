import multer from "multer"
import { MAX_WATERMARK_LOGO_BYTES, watermarkLogoSizeErrorMessage } from "../utils/watermarkLogoStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_WATERMARK_LOGO_BYTES,
        files: 1,
    },
})

export const uploadWatermarkLogo = upload.single("logo")

export const handleUploadWatermarkLogo = (req, res, next) => {
    uploadWatermarkLogo(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: watermarkLogoSizeErrorMessage(),
            })
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                message: "Only a logo file upload is allowed",
            })
        }
        return res.status(400).json({
            message: err.message || "Invalid logo upload",
        })
    })
}
