import multer from "multer"
import { MAX_LOGO_BYTES, logoSizeErrorMessage } from "../utils/studioLogoStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
})

/** Multipart: text fields + optional brand logo as `logo` or `brandLogo`. */
export const uploadStudioLogo = upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "brandLogo", maxCount: 1 },
    { name: "brand_logo", maxCount: 1 },
])

export const studioLogoUploadFile = (req) =>
    req.file ??
    req.files?.logo?.[0] ??
    req.files?.brandLogo?.[0] ??
    req.files?.brand_logo?.[0] ??
    null

export const handleUploadStudioLogo = (req, res, next) => {
    uploadStudioLogo(req, res, (err) => {
        if (!err) {
            const file = studioLogoUploadFile(req)
            if (file) req.file = file
            return next()
        }
        if (err.code === "LIMIT_FILE_SIZE") {
            return res
                .status(400)
                .json({ message: logoSizeErrorMessage() })
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                message: "Only logo or brandLogo file uploads are allowed",
            })
        }
        return res.status(400).json({
            message: err.message || "Invalid logo upload",
        })
    })
}
