import multer from "multer"
import { MAX_GALLERY_MUSIC_BYTES } from "../utils/galleryMusicStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: { fileSize: MAX_GALLERY_MUSIC_BYTES, files: 1 },
})

export const uploadGalleryMusicMw = upload.single("audio")

export const handleGalleryMusicUpload = (req, res, next) => {
    uploadGalleryMusicMw(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ message: "Audio must be 20MB or smaller" })
        }
        return res.status(400).json({
            message: err.message || "Invalid audio upload",
        })
    })
}
