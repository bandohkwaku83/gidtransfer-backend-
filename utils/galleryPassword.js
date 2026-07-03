import bcrypt from "bcryptjs"

const MIN_GALLERY_PASSWORD_LENGTH = 4

export const validateGalleryPasswordInput = (password) => {
    const trimmed = String(password ?? "").trim()
    if (!trimmed) {
        return { error: "password is required" }
    }
    if (trimmed.length < MIN_GALLERY_PASSWORD_LENGTH) {
        return {
            error: `password must be at least ${MIN_GALLERY_PASSWORD_LENGTH} characters`,
        }
    }
    return { password: trimmed }
}

export const hashGalleryPassword = async (password) => {
    const salt = await bcrypt.genSalt(10)
    return bcrypt.hash(password, salt)
}

export const verifyGalleryPassword = async (password, hash) => {
    if (!password || !hash) return false
    return bcrypt.compare(String(password), hash)
}
