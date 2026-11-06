import { loadOwnedGallery } from "../utils/galleryDetailHelpers.js"
import {
    applyFinalTrademark,
    formatFinalTrademark,
    parseFinalTrademarkInput,
} from "../utils/finalTrademarkFields.js"

const handleError = (res, error, label) => {
    if (error.statusCode === 400) {
        return res.status(400).json({ message: error.message })
    }
    console.error(label, error)
    return res.status(500).json({ message: "Server error" })
}

export const getGalleryTrademark = async (req, res) => {
    try {
        const gallery = await loadOwnedGallery(req.params.id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }
        return res.status(200).json({
            trademark: formatFinalTrademark(gallery),
        })
    } catch (error) {
        return handleError(res, error, "getGalleryTrademark:")
    }
}

export const updateGalleryTrademark = async (req, res) => {
    try {
        const gallery = await loadOwnedGallery(req.params.id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const { fields, errors } = parseFinalTrademarkInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const hasUpload = Boolean(req.file)
        if ((!fields || Object.keys(fields).length === 0) && !hasUpload) {
            return res.status(400).json({ message: "No changes to save" })
        }

        await applyFinalTrademark(gallery, fields ?? {}, {
            uploadedLogo: req.file ?? null,
        })
        await gallery.save()

        return res.status(200).json({
            message: "Trademark saved",
            trademark: formatFinalTrademark(gallery),
        })
    } catch (error) {
        return handleError(res, error, "updateGalleryTrademark:")
    }
}
