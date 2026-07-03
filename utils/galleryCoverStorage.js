import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const MAX_GALLERY_COVER_BYTES = 5_242_880 // 5 MiB

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const GALLERY_COVERS_DIR = path.join(
    __dirname,
    "..",
    "uploads",
    "gallery-covers"
)

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"])

export const ensureGalleryCoversDir = () => {
    fs.mkdirSync(GALLERY_COVERS_DIR, { recursive: true })
}

export const extensionForGalleryCoverMime = (mime) => {
    if (mime === "image/png") return ".png"
    if (mime === "image/webp") return ".webp"
    return ".jpg"
}

export const validateGalleryCoverFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Cover must be PNG, JPG, or WebP"
    }
    if (file.size > MAX_GALLERY_COVER_BYTES) {
        return "Cover must be 5MB or smaller"
    }
    return null
}

export const relativeGalleryCoverUrl = (filename) =>
    `/uploads/gallery-covers/${filename}`

export const absoluteGalleryCoverPath = (filename) =>
    path.join(GALLERY_COVERS_DIR, filename)

export const deleteGalleryCoverFile = (coverUrl) => {
    if (!coverUrl?.startsWith("/uploads/gallery-covers/")) return
    const filename = path.basename(coverUrl)
    const fullPath = absoluteGalleryCoverPath(filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore cleanup errors */
    }
}

export const saveGalleryCoverFile = async (galleryId, file) => {
    ensureGalleryCoversDir()
    const ext = extensionForGalleryCoverMime(file.mimetype)
    const filename = `${galleryId}${ext}`
    const dest = absoluteGalleryCoverPath(filename)
    await fs.promises.writeFile(dest, file.buffer)
    return relativeGalleryCoverUrl(filename)
}

/** Client share snapshot file (`{galleryId}-share.ext`), copied from the admin cover. */
export const shareCoverFilename = (galleryId, ext) => `${galleryId}-share${ext}`

export const copyGalleryCoverToShareSnapshot = async (galleryId, sourceCoverUrl) => {
    if (!sourceCoverUrl?.startsWith("/uploads/gallery-covers/")) return null
    ensureGalleryCoversDir()
    const ext = path.extname(sourceCoverUrl) || ".jpg"
    const sourcePath = absoluteGalleryCoverPath(path.basename(sourceCoverUrl))
    if (!fs.existsSync(sourcePath)) return null

    const filename = shareCoverFilename(galleryId, ext)
    const destPath = absoluteGalleryCoverPath(filename)
    await fs.promises.copyFile(sourcePath, destPath)
    return relativeGalleryCoverUrl(filename)
}
