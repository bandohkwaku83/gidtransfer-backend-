import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const MAX_WATERMARK_LOGO_BYTES = 5_000_000

export const watermarkLogoSizeErrorMessage = () =>
    "Watermark logo must be 5MB or smaller"

export const WATERMARK_LOGOS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "uploads",
    "watermark-logos"
)

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg"])

export const ensureWatermarkLogosDir = () => {
    fs.mkdirSync(WATERMARK_LOGOS_DIR, { recursive: true })
}

export const extensionForMime = (mime) => {
    if (mime === "image/png") return ".png"
    return ".jpg"
}

export const validateWatermarkLogoFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Watermark logo must be PNG or JPG"
    }
    if (file.size > MAX_WATERMARK_LOGO_BYTES) {
        return watermarkLogoSizeErrorMessage()
    }
    return null
}

export const relativeWatermarkLogoUrl = (filename) =>
    `/uploads/watermark-logos/${filename}`

export const absoluteWatermarkLogoPath = (filename) =>
    path.join(WATERMARK_LOGOS_DIR, filename)

export const deleteWatermarkLogoFile = (logoUrl) => {
    if (!logoUrl?.startsWith("/uploads/watermark-logos/")) return
    const filename = path.basename(logoUrl)
    const fullPath = absoluteWatermarkLogoPath(filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore cleanup errors */
    }
}

export const saveWatermarkLogoFile = async (userId, file) => {
    ensureWatermarkLogosDir()
    const ext = extensionForMime(file.mimetype)
    const filename = `${userId}${ext}`
    const dest = absoluteWatermarkLogoPath(filename)
    await fs.promises.writeFile(dest, file.buffer)
    return relativeWatermarkLogoUrl(filename)
}
