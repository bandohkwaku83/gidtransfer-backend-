import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

export const MAX_AVATAR_BYTES = 1_200_000

export const avatarSizeErrorMessage = () => "Profile photo must be 1.2 MB or smaller"

export const USER_AVATARS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "uploads",
    "user-avatars"
)

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg"])

export const ensureUserAvatarsDir = () => {
    fs.mkdirSync(USER_AVATARS_DIR, { recursive: true })
}

export const extensionForMime = (mime) => {
    if (mime === "image/png") return ".png"
    return ".jpg"
}

export const validateAvatarFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Profile photo must be PNG or JPG"
    }
    if (file.size > MAX_AVATAR_BYTES) {
        return avatarSizeErrorMessage()
    }
    return null
}

export const relativeAvatarUrl = (filename) =>
    `/uploads/user-avatars/${filename}`

export const absoluteAvatarPath = (filename) =>
    path.join(USER_AVATARS_DIR, filename)

export const deleteUserAvatarFile = (avatarUrl) => {
    if (!avatarUrl?.startsWith("/uploads/user-avatars/")) return
    const filename = path.basename(avatarUrl)
    const fullPath = absoluteAvatarPath(filename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore cleanup errors */
    }
}

export const saveUserAvatarFile = async (userId, file) => {
    ensureUserAvatarsDir()
    const ext = extensionForMime(file.mimetype)
    const filename = `${userId}${ext}`
    const dest = absoluteAvatarPath(filename)
    await fs.promises.writeFile(dest, file.buffer)
    return relativeAvatarUrl(filename)
}
