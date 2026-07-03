import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const MAX_LOGO_BYTES = 5_000_000

/** Base64 data URLs are ~4/3 the binary size plus a short header. */
export const MAX_LOGO_DATA_URL_LENGTH = Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 128

export const logoSizeErrorMessage = () => "Logo must be 5MB or smaller"
export const STUDIO_LOGOS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "uploads",
    "studio-logos"
)

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg"])

export const ensureStudioLogosDir = () => {
    fs.mkdirSync(STUDIO_LOGOS_DIR, { recursive: true })
}

export const extensionForMime = (mime) => {
    if (mime === "image/png") return ".png"
    return ".jpg"
}

export const validateLogoFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Logo must be PNG or JPG"
    }
    if (file.size > MAX_LOGO_BYTES) {
        return logoSizeErrorMessage()
    }
    return null
}

export const relativeLogoUrl = (filename) =>
    `/uploads/studio-logos/${filename}`

export const absoluteLogoPath = (filename) =>
    path.join(STUDIO_LOGOS_DIR, filename)

export const deleteStudioLogoFile = (logoUrl) => {
    if (!logoUrl?.startsWith("/uploads/studio-logos/")) return
    const filename = path.basename(logoUrl)
    const fullPath = absoluteLogoPath(filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore cleanup errors */
    }
}

export const saveStudioLogoFile = async (userId, file) => {
    ensureStudioLogosDir()
    const ext = extensionForMime(file.mimetype)
    const filename = `${userId}${ext}`
    const dest = absoluteLogoPath(filename)
    await fs.promises.writeFile(dest, file.buffer)
    return relativeLogoUrl(filename)
}
