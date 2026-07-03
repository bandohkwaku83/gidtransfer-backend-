import { applyWatermarkFieldsToUser } from "../utils/applyWatermarkFields.js"
import { formatWatermarkResponse, parseWatermarkInput } from "../utils/watermarkFields.js"

const handleWatermarkError = (res, error) => {
    if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({ message: error.message })
    }
    console.error("Watermark settings error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const getWatermarkSettings = async (req, res) => {
    try {
        return res.status(200).json({
            watermark: formatWatermarkResponse(req.user),
        })
    } catch (error) {
        return handleWatermarkError(res, error)
    }
}

export const updateWatermarkSettings = async (req, res) => {
    try {
        const { fields, errors } = parseWatermarkInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const hasUpload = Boolean(req.file)
        if ((!fields || Object.keys(fields).length === 0) && !hasUpload) {
            return res.status(400).json({ message: "No changes to save" })
        }

        await applyWatermarkFieldsToUser(req.user, fields ?? {}, {
            uploadedLogo: req.file ?? null,
        })
        await req.user.save()

        return res.status(200).json({
            message: "Watermark settings saved",
            watermark: formatWatermarkResponse(req.user),
        })
    } catch (error) {
        return handleWatermarkError(res, error)
    }
}
