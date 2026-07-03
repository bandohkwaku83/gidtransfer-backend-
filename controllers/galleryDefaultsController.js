import { applyGalleryDefaultsFieldsToUser } from "../utils/applyGalleryDefaultsFields.js"
import {
    formatGalleryDefaultsResponse,
    parseGalleryDefaultsInput,
} from "../utils/galleryDefaultsFields.js"
import { galleryDefaultsUploadedCover } from "../middleware/uploadGalleryDefaults.js"

const handleGalleryDefaultsError = (res, error) => {
    if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({ message: error.message })
    }
    console.error("Gallery defaults error:", error)
    return res.status(500).json({ message: "Server error" })
}

const saveGalleryDefaults = async (req, res, { fields, uploadedCover }) => {
    await applyGalleryDefaultsFieldsToUser(req.user, fields ?? {}, {
        uploadedCover,
    })
    await req.user.save()

    return res.status(200).json({
        message: "Gallery defaults saved",
        galleryDefaults: formatGalleryDefaultsResponse(req.user),
    })
}

export const getGalleryDefaultsSettings = async (req, res) => {
    try {
        return res.status(200).json({
            galleryDefaults: formatGalleryDefaultsResponse(req.user),
        })
    } catch (error) {
        return handleGalleryDefaultsError(res, error)
    }
}

export const updateGalleryDefaultsSettings = async (req, res) => {
    try {
        const { fields, errors } = parseGalleryDefaultsInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const uploadedCover = galleryDefaultsUploadedCover(req)
        if ((!fields || Object.keys(fields).length === 0) && !uploadedCover) {
            return res.status(400).json({ message: "No changes to save" })
        }

        return await saveGalleryDefaults(req, res, { fields, uploadedCover })
    } catch (error) {
        return handleGalleryDefaultsError(res, error)
    }
}

/** Toggle watermark preview on selection thumbnails only. */
export const patchGalleryDefaultsWatermarkPreview = async (req, res) => {
    try {
        const { fields, errors } = parseGalleryDefaultsInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }
        if (fields?.watermarkPreviewEnabled === undefined) {
            return res.status(400).json({
                message:
                    "watermarkPreviewEnabled (or enabled) is required",
            })
        }

        return await saveGalleryDefaults(req, res, {
            fields: {
                watermarkPreviewEnabled: fields.watermarkPreviewEnabled,
            },
        })
    } catch (error) {
        return handleGalleryDefaultsError(res, error)
    }
}

/** Upload or replace the account default gallery cover. */
export const uploadGalleryDefaultsCover = async (req, res) => {
    try {
        const uploadedCover = galleryDefaultsUploadedCover(req)
        if (!uploadedCover) {
            return res.status(400).json({
                message:
                    "Cover file is required (form field: cover or defaultCover)",
            })
        }

        return await saveGalleryDefaults(req, res, {
            fields: {},
            uploadedCover,
        })
    } catch (error) {
        return handleGalleryDefaultsError(res, error)
    }
}

/** Remove the account default gallery cover. */
export const deleteGalleryDefaultsCover = async (req, res) => {
    try {
        return await saveGalleryDefaults(req, res, {
            fields: { clearCover: true, defaultCoverDataUrl: "" },
        })
    } catch (error) {
        return handleGalleryDefaultsError(res, error)
    }
}
