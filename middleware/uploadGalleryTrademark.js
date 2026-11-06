import multer from "multer"
import {
    MAX_TRADEMARK_LOGO_BYTES,
    trademarkLogoSizeErrorMessage,
} from "../utils/finalTrademarkStorage.js"

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_TRADEMARK_LOGO_BYTES,
        files: 1,
    },
})

const uploadTrademarkLogo = upload.single("logo")

export const handleUploadGalleryTrademark = (req, res, next) => {
    const contentType = String(req.headers["content-type"] || "")
    if (!contentType.includes("multipart/form-data")) return next()

    uploadTrademarkLogo(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: trademarkLogoSizeErrorMessage(),
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
