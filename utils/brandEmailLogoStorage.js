import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { resolveMediaUrl } from "./formatUserResponse.js"
import {
    extensionForMime,
    MAX_LOGO_BYTES,
    validateLogoFile,
} from "./studioLogoStorage.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const BRAND_UPLOADS_DIR = path.join(__dirname, "..", "uploads", "brand")
export const BRAND_EMAIL_LOGO_BASENAME = "email-logo"

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"])

export const ensureBrandUploadsDir = () => {
    fs.mkdirSync(BRAND_UPLOADS_DIR, { recursive: true })
}

const relativeBrandLogoUrl = (filename) => `/uploads/brand/${filename}`

export const findBrandEmailLogoFilename = () => {
    ensureBrandUploadsDir()
    for (const ext of ALLOWED_EXTENSIONS) {
        const filename = `${BRAND_EMAIL_LOGO_BASENAME}${ext}`
        if (fs.existsSync(path.join(BRAND_UPLOADS_DIR, filename))) {
            return filename
        }
    }
    return null
}

export const getBrandEmailLogoRelativeUrl = () => {
    const filename = findBrandEmailLogoFilename()
    return filename ? relativeBrandLogoUrl(filename) : null
}

/** Absolute public URL for use in HTML emails. */
export const getBrandEmailLogoPublicUrl = () => {
    const relative = getBrandEmailLogoRelativeUrl()
    return relative ? resolveMediaUrl(relative) : null
}

export const deleteBrandEmailLogo = () => {
    ensureBrandUploadsDir()
    for (const ext of ALLOWED_EXTENSIONS) {
        const filename = `${BRAND_EMAIL_LOGO_BASENAME}${ext}`
        const fullPath = path.join(BRAND_UPLOADS_DIR, filename)
        try {
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
        } catch {
            /* ignore */
        }
    }
}

export const saveBrandEmailLogo = async (file) => {
    const error = validateLogoFile(file)
    if (error) {
        const err = new Error(error)
        err.statusCode = 400
        throw err
    }

    ensureBrandUploadsDir()
    deleteBrandEmailLogo()

    const ext = extensionForMime(file.mimetype)
    const filename = `${BRAND_EMAIL_LOGO_BASENAME}${ext}`
    const dest = path.join(BRAND_UPLOADS_DIR, filename)
    await fs.promises.writeFile(dest, file.buffer)

    return {
        filename,
        logoUrl: relativeBrandLogoUrl(filename),
        logoSrc: getBrandEmailLogoPublicUrl(),
    }
}

export { MAX_LOGO_BYTES }
