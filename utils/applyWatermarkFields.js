import {
    DEFAULT_WATERMARK_PLACEMENT,
    DEFAULT_WATERMARK_TRIM,
} from "./watermarkFields.js"
import {
    deleteWatermarkLogoFile,
    saveWatermarkLogoFile,
    validateWatermarkLogoFile,
} from "./watermarkLogoStorage.js"

const mergeTrim = (current, patch) => ({
    ...DEFAULT_WATERMARK_TRIM(),
    ...(current ?? {}),
    ...(patch ?? {}),
})

const mergePlacement = (current, patch) => ({
    ...DEFAULT_WATERMARK_PLACEMENT(),
    ...(current ?? {}),
    ...(patch ?? {}),
})

export const applyWatermarkFieldsToUser = async (
    user,
    fields,
    { uploadedLogo } = {}
) => {
    const watermark = user.watermark ?? {}
    const previousLogoUrl = watermark.logoUrl || ""

    if (fields.enabled !== undefined) {
        watermark.enabled = fields.enabled
    }

    if (fields.trim !== undefined) {
        watermark.trim = mergeTrim(watermark.trim, fields.trim)
    }

    if (fields.portrait !== undefined) {
        watermark.portrait = mergePlacement(watermark.portrait, fields.portrait)
    }

    if (fields.landscape !== undefined) {
        watermark.landscape = mergePlacement(
            watermark.landscape,
            fields.landscape
        )
    }

    if (uploadedLogo) {
        const logoError = validateWatermarkLogoFile(uploadedLogo)
        if (logoError) {
            const err = new Error(logoError)
            err.statusCode = 400
            throw err
        }
        watermark.logoUrl = await saveWatermarkLogoFile(
            user._id.toString(),
            uploadedLogo
        )
        watermark.logoDataUrl = ""
        if (previousLogoUrl && previousLogoUrl !== watermark.logoUrl) {
            deleteWatermarkLogoFile(previousLogoUrl)
        }
    } else if (fields.logoDataUrl !== undefined) {
        if (fields.logoDataUrl) {
            watermark.logoDataUrl = fields.logoDataUrl
            if (previousLogoUrl) {
                deleteWatermarkLogoFile(previousLogoUrl)
                watermark.logoUrl = ""
            }
        } else if (fields.clearLogo) {
            watermark.logoDataUrl = ""
            deleteWatermarkLogoFile(previousLogoUrl)
            watermark.logoUrl = ""
        }
    }

    if (!watermark.trim) {
        watermark.trim = DEFAULT_WATERMARK_TRIM()
    }
    if (!watermark.portrait) {
        watermark.portrait = DEFAULT_WATERMARK_PLACEMENT()
    }
    if (!watermark.landscape) {
        watermark.landscape = DEFAULT_WATERMARK_PLACEMENT()
    }

    user.watermark = watermark
    return user
}
