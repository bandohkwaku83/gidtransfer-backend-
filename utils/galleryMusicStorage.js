import fs from "fs"
import path from "path"
import crypto from "crypto"
import { fileURLToPath } from "url"

export const MAX_GALLERY_MUSIC_BYTES = 20_971_520 // 20 MiB

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const GALLERY_MUSIC_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "gallery-music"
)

const ALLOWED_MIME = new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/aac",
    "audio/ogg",
])

export const ensureGalleryMusicDir = () => {
    fs.mkdirSync(GALLERY_MUSIC_DIR, { recursive: true })
}

export const extensionForMusicMime = (mime) => {
    if (mime === "audio/wav" || mime === "audio/x-wav") return ".wav"
    if (mime === "audio/m4a" || mime === "audio/x-m4a" || mime === "audio/mp4")
        return ".m4a"
    if (mime === "audio/ogg") return ".ogg"
    if (mime === "audio/aac") return ".aac"
    return ".mp3"
}

export const validateGalleryMusicFile = (file) => {
    if (!file) return "No audio file provided"
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Audio must be MP3, M4A, WAV, AAC, or OGG"
    }
    if (file.size > MAX_GALLERY_MUSIC_BYTES) {
        return "Audio must be 20MB or smaller"
    }
    return null
}

export const relativeGalleryMusicUrl = (filename) =>
    `/uploads/gallery-music/${filename}`

export const deleteGalleryMusicFile = (musicUrl) => {
    if (!musicUrl?.startsWith("/uploads/gallery-music/")) return
    const filename = path.basename(musicUrl)
    const fullPath = path.join(GALLERY_MUSIC_DIR, filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore */
    }
}

export const saveGalleryMusicFile = async (galleryId, file) => {
    ensureGalleryMusicDir()
    const ext = extensionForMusicMime(file.mimetype)
    const filename = `${galleryId}${ext}`
    const dest = path.join(GALLERY_MUSIC_DIR, filename)
    await fs.promises.writeFile(dest, file.buffer)
    return relativeGalleryMusicUrl(filename)
}
