import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const MAX_GALLERY_DEFAULT_COVER_BYTES = 5_242_880

export const galleryDefaultCoverSizeErrorMessage = () =>
    "Default cover must be 5MB or smaller"

export const GALLERY_DEFAULT_COVERS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "uploads",
    "gallery-default-covers"
)

const ALLOWED_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
])

export const ensureGalleryDefaultCoversDir = () => {
    fs.mkdirSync(GALLERY_DEFAULT_COVERS_DIR, { recursive: true })
}

export const extensionForMime = (mime) => {
    if (mime === "image/png") return ".png"
    if (mime === "image/webp") return ".webp"
    return ".jpg"
}

export const validateGalleryDefaultCoverFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Default cover must be PNG, JPG, or WebP"
    }
    if (file.size > MAX_GALLERY_DEFAULT_COVER_BYTES) {
        return galleryDefaultCoverSizeErrorMessage()
    }
    return null
}

export const relativeGalleryDefaultCoverUrl = (filename) =>
    `/uploads/gallery-default-covers/${filename}`

export const absoluteGalleryDefaultCoverPath = (filename) =>
    path.join(GALLERY_DEFAULT_COVERS_DIR, filename)

export const deleteGalleryDefaultCoverFile = (coverUrl) => {
    if (!coverUrl?.startsWith("/uploads/gallery-default-covers/")) return
    const filename = path.basename(coverUrl)
    const fullPath = absoluteGalleryDefaultCoverPath(filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore cleanup errors */
    }
}

export const saveGalleryDefaultCoverFile = async (userId, file) => {
    ensureGalleryDefaultCoversDir()
    const ext = extensionForMime(file.mimetype)
    const filename = `${userId}${ext}`
    const dest = absoluteGalleryDefaultCoverPath(filename)
    await fs.promises.writeFile(dest, file.buffer)
    return relativeGalleryDefaultCoverUrl(filename)
}
