import {
    deleteGalleryDefaultCoverFile,
    saveGalleryDefaultCoverFile,
    validateGalleryDefaultCoverFile,
} from "./galleryDefaultCoverStorage.js"

export const applyGalleryDefaultsFieldsToUser = async (
    user,
    fields,
    { uploadedCover } = {}
) => {
    const current = user.galleryDefaults?.toObject?.() ?? user.galleryDefaults ?? {}
    const galleryDefaults = { ...current }
    const previousCoverUrl = galleryDefaults.defaultCoverUrl || ""

    if (fields.watermarkPreviewEnabled !== undefined) {
        galleryDefaults.watermarkPreviewEnabled =
            fields.watermarkPreviewEnabled
    }

    if (uploadedCover) {
        const coverError = validateGalleryDefaultCoverFile(uploadedCover)
        if (coverError) {
            const err = new Error(coverError)
            err.statusCode = 400
            throw err
        }
        galleryDefaults.defaultCoverUrl = await saveGalleryDefaultCoverFile(
            user._id.toString(),
            uploadedCover
        )
        galleryDefaults.defaultCoverDataUrl = ""
        if (
            previousCoverUrl &&
            previousCoverUrl !== galleryDefaults.defaultCoverUrl
        ) {
            deleteGalleryDefaultCoverFile(previousCoverUrl)
        }
    } else if (fields.defaultCoverDataUrl !== undefined) {
        if (fields.defaultCoverDataUrl) {
            galleryDefaults.defaultCoverDataUrl = fields.defaultCoverDataUrl
            if (previousCoverUrl) {
                deleteGalleryDefaultCoverFile(previousCoverUrl)
                galleryDefaults.defaultCoverUrl = ""
            }
        } else if (fields.clearCover) {
            galleryDefaults.defaultCoverDataUrl = ""
            deleteGalleryDefaultCoverFile(previousCoverUrl)
            galleryDefaults.defaultCoverUrl = ""
        }
    }

    user.galleryDefaults = galleryDefaults
    user.markModified("galleryDefaults")
    return user
}
