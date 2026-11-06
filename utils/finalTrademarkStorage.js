import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const MAX_TRADEMARK_LOGO_BYTES = 3 * 1024 * 1024

export const trademarkLogoSizeErrorMessage = () =>
    "Trademark logo must be 3 MB or smaller"

export const TRADEMARK_LOGOS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "uploads",
    "gallery-trademarks"
)

const ALLOWED_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
])

const EXT_FOR_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}

export const ensureTrademarkLogosDir = () => {
    fs.mkdirSync(TRADEMARK_LOGOS_DIR, { recursive: true })
}

export const validateTrademarkLogoFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Trademark logo must be a PNG, JPG, or WebP"
    }
    if (file.size > MAX_TRADEMARK_LOGO_BYTES) {
        return trademarkLogoSizeErrorMessage()
    }
    return null
}

export const relativeTrademarkLogoUrl = (filename) =>
    `/uploads/gallery-trademarks/${filename}`

export const absoluteTrademarkLogoPath = (filename) =>
    path.join(TRADEMARK_LOGOS_DIR, filename)

export const deleteTrademarkLogoFile = (logoUrl) => {
    if (!logoUrl?.startsWith("/uploads/gallery-trademarks/")) return
    const filename = path.basename(logoUrl)
    const fullPath = absoluteTrademarkLogoPath(filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore cleanup errors */
    }
}

export const saveTrademarkLogoFile = async (galleryId, file) => {
    ensureTrademarkLogosDir()
    const ext = EXT_FOR_MIME[file.mimetype] || ".png"
    const filename = `${galleryId}${ext}`
    const dest = absoluteTrademarkLogoPath(filename)
    await fs.promises.writeFile(dest, file.buffer)
    for (const other of [".png", ".jpg", ".webp"]) {
        if (other === ext) continue
        const stale = absoluteTrademarkLogoPath(`${galleryId}${other}`)
        if (fs.existsSync(stale)) {
            await fs.promises.unlink(stale).catch(() => {})
        }
    }
    return relativeTrademarkLogoUrl(filename)
}

const DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\r\n]+)$/i

export const saveTrademarkLogoDataUrl = async (galleryId, dataUrl) => {
    const match = String(dataUrl || "").trim().match(DATA_URL_RE)
    if (!match) {
        const err = new Error("Trademark logo must be a PNG, JPG, or WebP")
        err.statusCode = 400
        throw err
    }
    const buffer = Buffer.from(match[2], "base64")
    if (!buffer.length || buffer.length > MAX_TRADEMARK_LOGO_BYTES) {
        const err = new Error(trademarkLogoSizeErrorMessage())
        err.statusCode = 400
        throw err
    }
    const mime =
        match[1].toLowerCase() === "png"
            ? "image/png"
            : match[1].toLowerCase() === "webp"
              ? "image/webp"
              : "image/jpeg"
    return saveTrademarkLogoFile(galleryId, { mimetype: mime, buffer })
}
