import multer from "multer"
import { MAX_LOGO_BYTES, logoSizeErrorMessage } from "../utils/studioLogoStorage.js"
import {
    MAX_AVATAR_BYTES,
    avatarSizeErrorMessage,
} from "../utils/userAvatarStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: Math.max(MAX_LOGO_BYTES, MAX_AVATAR_BYTES),
        files: 2,
    },
})

/** Multipart form-data: text fields + optional `logo` and/or `avatar` files. */
export const uploadSettingsMedia = upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
])

export const handleUploadSettings = (req, res, next) => {
    uploadSettingsMedia(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: logoSizeErrorMessage(),
            })
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                message: "Only logo and avatar file uploads are allowed",
            })
        }
        return res.status(400).json({
            message: err.message || "Invalid upload",
        })
    })
}

export const settingsUploadedFiles = (req) => ({
    uploadedLogo: req.files?.logo?.[0] ?? null,
    uploadedAvatar: req.files?.avatar?.[0] ?? null,
})
