import { resolveMediaUrl } from "./formatUserResponse.js"
import { parseLogoDataUrl } from "./studioFields.js"

export const WATERMARK_SIZES = ["small", "medium", "large"]

export const WATERMARK_SIZE_LABELS = {
    small: "Small",
    medium: "Medium",
    large: "Large",
}

export const DEFAULT_WATERMARK_PLACEMENT = () => ({
    size: "medium",
    opacity: 65,
    positionX: 85,
    positionY: 90,
})

export const DEFAULT_WATERMARK_TRIM = () => ({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
})

const parseBool = (value) => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "boolean") return value
    const normalized = String(value).trim().toLowerCase()
    if (normalized === "true" || normalized === "1") return true
    if (normalized === "false" || normalized === "0") return false
    return undefined
}

const parseNumber = (value, { min, max, fieldName }) => {
    if (value === undefined || value === null || value === "") return undefined
    const n = Number(value)
    if (!Number.isFinite(n)) {
        return { error: `${fieldName} must be a number` }
    }
    if (min !== undefined && n < min) {
        return { error: `${fieldName} must be at least ${min}` }
    }
    if (max !== undefined && n > max) {
        return { error: `${fieldName} must be at most ${max}` }
    }
    return { value: n }
}

const parseSize = (value, fieldName = "Logo size") => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase()
        if (WATERMARK_SIZES.includes(normalized)) return normalized
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) {
        return { error: `${fieldName} must be small, medium, or large` }
    }
    if (numeric <= 33) return "small"
    if (numeric <= 66) return "medium"
    return "large"
}

const parseJsonObject = (value, fieldName) => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "object") return value
    if (typeof value !== "string") {
        return { error: `${fieldName} must be a valid object` }
    }
    try {
        return JSON.parse(value)
    } catch {
        return { error: `${fieldName} must be valid JSON` }
    }
}

const parseTrimInput = (body, errors, fields) => {
    const trimRaw =
        body.trim ??
        body.watermarkTrim ??
        (body.trimX !== undefined ||
        body.trimY !== undefined ||
        body.trimWidth !== undefined ||
        body.trimHeight !== undefined
            ? {
                  x: body.trimX ?? body.trim_x,
                  y: body.trimY ?? body.trim_y,
                  width: body.trimWidth ?? body.trim_width,
                  height: body.trimHeight ?? body.trim_height,
              }
            : undefined)

    if (trimRaw === undefined) return

    const trimObj =
        typeof trimRaw === "object" ? trimRaw : parseJsonObject(trimRaw, "Trim")
    if (trimObj?.error) {
        errors.push(trimObj.error)
        return
    }

    const trim = {}
    for (const [key, sourceKey, label] of [
        ["x", trimObj.x, "Trim x"],
        ["y", trimObj.y, "Trim y"],
        ["width", trimObj.width, "Trim width"],
        ["height", trimObj.height, "Trim height"],
    ]) {
        if (sourceKey === undefined || sourceKey === null || sourceKey === "") {
            continue
        }
        const parsed = parseNumber(sourceKey, {
            min: 0,
            max: 1,
            fieldName: label,
        })
        if (parsed?.error) {
            errors.push(parsed.error)
            return
        }
        trim[key] = parsed.value
    }

    if (Object.keys(trim).length) {
        fields.trim = trim
    }
}

const parsePlacementInput = (body, orientation, errors, fields) => {
    const prefix = orientation
    const raw =
        body[prefix] ??
        body[`${prefix}Settings`] ??
        (body[`${prefix}Size`] !== undefined ||
        body[`${prefix}Opacity`] !== undefined ||
        body[`${prefix}PositionX`] !== undefined ||
        body[`${prefix}PositionY`] !== undefined
            ? {
                  size: body[`${prefix}Size`] ?? body[`${prefix}SizeScale`],
                  opacity: body[`${prefix}Opacity`],
                  positionX:
                      body[`${prefix}PositionX`] ?? body[`${prefix}Position_x`],
                  positionY:
                      body[`${prefix}PositionY`] ?? body[`${prefix}Position_y`],
              }
            : undefined)

    if (raw === undefined) return

    const placementObj =
        typeof raw === "object" ? raw : parseJsonObject(raw, `${prefix} settings`)
    if (placementObj?.error) {
        errors.push(placementObj.error)
        return
    }

    const placement = {}

    if (placementObj.size !== undefined && placementObj.size !== "") {
        const size = parseSize(placementObj.size)
        if (size?.error) {
            errors.push(size.error)
            return
        }
        placement.size = size
    }

    if (placementObj.opacity !== undefined && placementObj.opacity !== "") {
        const opacity = parseNumber(placementObj.opacity, {
            min: 0,
            max: 100,
            fieldName: "Opacity",
        })
        if (opacity?.error) {
            errors.push(opacity.error)
            return
        }
        placement.opacity = opacity.value
    }

    for (const [targetKey, sourceKey, label] of [
        ["positionX", placementObj.positionX ?? placementObj.x, "Position x"],
        ["positionY", placementObj.positionY ?? placementObj.y, "Position y"],
    ]) {
        if (sourceKey === undefined || sourceKey === null || sourceKey === "") {
            continue
        }
        const parsed = parseNumber(sourceKey, {
            min: 0,
            max: 100,
            fieldName: label,
        })
        if (parsed?.error) {
            errors.push(parsed.error)
            return
        }
        placement[targetKey] = parsed.value
    }

    if (Object.keys(placement).length) {
        fields[orientation] = placement
    }
}

export const parseWatermarkInput = (body, { partial = true } = {}) => {
    const errors = []
    const fields = {}

    const enabled = parseBool(
        body.enabled ??
            body.isWatermarkEnabled ??
            body.watermarkEnabled ??
            body.putLogoOnDownloads
    )
    if (enabled !== undefined) {
        fields.enabled = enabled
    }

    parseTrimInput(body, errors, fields)
    parsePlacementInput(body, "portrait", errors, fields)
    parsePlacementInput(body, "landscape", errors, fields)

    const logoRaw = body.logoDataUrl ?? body.watermarkLogoDataUrl
    if (logoRaw !== undefined && logoRaw !== null && logoRaw !== "") {
        const logoResult = parseLogoDataUrl(logoRaw)
        if (logoResult.error) {
            errors.push(logoResult.error)
        } else if (logoResult.value) {
            fields.logoDataUrl = logoResult.value
        }
    } else if (body.clearLogo === true || body.clearLogo === "true") {
        fields.logoDataUrl = ""
        fields.clearLogo = true
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    if (!partial && enabled === undefined) {
        errors.push("enabled is required")
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    return { fields, errors: [] }
}

export const resolveWatermarkLogoSrc = (watermark) => {
    if (!watermark) return undefined
    const logoUrl = watermark.logoUrl?.trim()
    const logoDataUrl = watermark.logoDataUrl?.trim()
    if (logoUrl) {
        return resolveMediaUrl(logoUrl)
    }
    return logoDataUrl || undefined
}

const shapePlacement = (placement) => {
    const p = {
        ...DEFAULT_WATERMARK_PLACEMENT(),
        ...(placement ?? {}),
    }
    const size = WATERMARK_SIZES.includes(p.size) ? p.size : "medium"

    return {
        size,
        sizeLabel: WATERMARK_SIZE_LABELS[size],
        opacity: Math.round(Math.min(100, Math.max(0, Number(p.opacity) || 0))),
        position: {
            x: Math.round(Math.min(100, Math.max(0, Number(p.positionX) || 0))),
            y: Math.round(Math.min(100, Math.max(0, Number(p.positionY) || 0))),
        },
    }
}

export const formatWatermarkResponse = (user) => {
    const doc = user.toJSON ? user.toJSON() : user
    const watermark = doc.watermark ?? {}
    const trim = {
        ...DEFAULT_WATERMARK_TRIM(),
        ...(watermark.trim ?? {}),
    }
    const logoSrc = resolveWatermarkLogoSrc(watermark)

    return {
        enabled: Boolean(watermark.enabled),
        logo: {
            logoSrc: logoSrc ?? null,
            logoUrl: watermark.logoUrl?.trim()
                ? resolveMediaUrl(watermark.logoUrl)
                : null,
            trim: {
                x: trim.x,
                y: trim.y,
                width: trim.width,
                height: trim.height,
            },
        },
        portrait: shapePlacement(watermark.portrait),
        landscape: shapePlacement(watermark.landscape),
    }
}
