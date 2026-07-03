import { resolveMediaUrl } from "./formatUserResponse.js"
import { parseLogoDataUrl } from "./studioFields.js"

const parseBool = (value) => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "boolean") return value
    const normalized = String(value).trim().toLowerCase()
    if (normalized === "true" || normalized === "1" || normalized === "on") {
        return true
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
        return false
    }
    return undefined
}

export const parseGalleryDefaultsInput = (body) => {
    const errors = []
    const fields = {}

    const watermarkPreviewEnabled = parseBool(
        body.watermarkPreviewEnabled ??
            body.watermarkPreviewImages ??
            body.watermark_preview_enabled ??
            body.watermarkPreview ??
            body.enabled
    )
    if (watermarkPreviewEnabled !== undefined) {
        fields.watermarkPreviewEnabled = watermarkPreviewEnabled
    }

    const coverRaw =
        body.coverDataUrl ??
        body.defaultCoverDataUrl ??
        body.default_cover_data_url
    if (coverRaw !== undefined && coverRaw !== null && coverRaw !== "") {
        const coverResult = parseLogoDataUrl(coverRaw)
        if (coverResult.error) {
            errors.push(coverResult.error)
        } else if (coverResult.value) {
            fields.defaultCoverDataUrl = coverResult.value
        }
    } else if (
        body.clearCover === true ||
        body.clearCover === "true" ||
        body.removeDefaultCover === true ||
        body.removeDefaultCover === "true"
    ) {
        fields.defaultCoverDataUrl = ""
        fields.clearCover = true
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    return { fields, errors: [] }
}

export const resolveGalleryDefaultCoverSrc = (galleryDefaults) => {
    if (!galleryDefaults) return undefined
    const coverUrl = galleryDefaults.defaultCoverUrl?.trim()
    const coverDataUrl = galleryDefaults.defaultCoverDataUrl?.trim()
    if (coverUrl) {
        return resolveMediaUrl(coverUrl)
    }
    return coverDataUrl || undefined
}

export const formatGalleryDefaultsResponse = (user) => {
    const doc = user.toJSON ? user.toJSON() : user
    const galleryDefaults = doc.galleryDefaults ?? {}
    const coverSrc = resolveGalleryDefaultCoverSrc(galleryDefaults)
    const hasCover = Boolean(coverSrc)

    return {
        watermarkPreviewEnabled: Boolean(galleryDefaults.watermarkPreviewEnabled),
        watermarkPreview: {
            enabled: Boolean(galleryDefaults.watermarkPreviewEnabled),
            title: "Watermark preview images",
            description:
                "Adds a text watermark on client selection thumbnails. Brand logo on finals is under Watermark.",
        },
        defaultCover: {
            hasCover,
            coverSrc: coverSrc ?? null,
            coverUrl: galleryDefaults.defaultCoverUrl?.trim()
                ? resolveMediaUrl(galleryDefaults.defaultCoverUrl)
                : null,
            emptyStateLabel: hasCover ? null : "No default cover uploaded",
        },
    }
}
