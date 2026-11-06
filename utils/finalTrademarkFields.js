import { resolveMediaUrl } from "./formatUserResponse.js"
import {
    deleteTrademarkLogoFile,
    saveTrademarkLogoDataUrl,
    saveTrademarkLogoFile,
    validateTrademarkLogoFile,
} from "./finalTrademarkStorage.js"

export const DEFAULT_FINAL_TRADEMARK = () => ({
    logoUrl: "",
    posX: 0.88,
    posY: 0.88,
    sizePercent: 16,
})

const SIZE_LABELS = {
    small: 12,
    medium: 18,
    large: 28,
}

const isTruthyFlag = (value) =>
    value === true || value === "true" || value === "1" || value === 1

const parseUnit = (value, fieldName) => {
    if (value === undefined || value === null || value === "") return undefined
    const n = Number(value)
    if (!Number.isFinite(n)) {
        return { error: `${fieldName} must be a number` }
    }
    const unit = n > 1 && n <= 100 ? n / 100 : n
    if (unit < 0 || unit > 1) {
        return { error: `${fieldName} must be from 0 to 1, or from 0 to 100` }
    }
    return { value: Math.round(unit * 10000) / 10000 }
}

const parseSize = (value) => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "string") {
        const label = SIZE_LABELS[value.trim().toLowerCase()]
        if (label) return { value: label }
    }
    const n = Number(value)
    if (!Number.isFinite(n)) {
        return { error: "Size must be a number from 8 to 36" }
    }
    const rounded = Math.round(n)
    if (rounded < 8 || rounded > 36) {
        return { error: "Size must be a number from 8 to 36" }
    }
    return { value: rounded }
}

const readBody = (body) => {
    const source = body && typeof body === "object" ? body : {}
    const nested = source.trademark ?? source.finalTrademark
    if (nested === undefined || nested === null || nested === "") {
        return { value: source }
    }
    if (typeof nested === "string") {
        try {
            const parsed = JSON.parse(nested)
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                return { error: "trademark must be a JSON object" }
            }
            return { value: { ...source, ...parsed } }
        } catch {
            return { error: "trademark must be a JSON object" }
        }
    }
    if (typeof nested === "object" && !Array.isArray(nested)) {
        return { value: { ...source, ...nested } }
    }
    return { error: "trademark must be a JSON object" }
}

export const parseFinalTrademarkInput = (body) => {
    const read = readBody(body)
    if (read.error) return { fields: null, errors: [read.error] }
    const source = read.value
    const errors = []
    const fields = {}

    const posX = parseUnit(
        source.posX ?? source.positionX ?? source.position_x,
        "Position x"
    )
    if (posX?.error) errors.push(posX.error)
    else if (posX) fields.posX = posX.value

    const posY = parseUnit(
        source.posY ?? source.positionY ?? source.position_y,
        "Position y"
    )
    if (posY?.error) errors.push(posY.error)
    else if (posY) fields.posY = posY.value

    const size = parseSize(source.sizePercent ?? source.size)
    if (size?.error) errors.push(size.error)
    else if (size) fields.sizePercent = size.value

    const logoRaw = source.logoDataUrl ?? source.logoSrc
    if (typeof logoRaw === "string" && logoRaw.trim().startsWith("data:")) {
        fields.logoDataUrl = logoRaw.trim()
    }

    if (
        isTruthyFlag(source.clearLogo) ||
        isTruthyFlag(source.removeLogo) ||
        isTruthyFlag(source.remove)
    ) {
        fields.clearLogo = true
    }

    if (errors.length) return { fields: null, errors }
    return { fields, errors: [] }
}

export const formatFinalTrademark = (gallery) => {
    const plain = gallery?.toObject?.() ?? gallery ?? {}
    const mark = {
        ...DEFAULT_FINAL_TRADEMARK(),
        ...(plain.finalTrademark ?? {}),
    }
    const logoUrl = typeof mark.logoUrl === "string" ? mark.logoUrl.trim() : ""
    const posX = Number(mark.posX)
    const posY = Number(mark.posY)
    const sizePercent = Number(mark.sizePercent)

    return {
        logoSrc: logoUrl ? resolveMediaUrl(logoUrl) : null,
        logoUrl: logoUrl || null,
        posX: Number.isFinite(posX) ? Math.min(1, Math.max(0, posX)) : 0.88,
        posY: Number.isFinite(posY) ? Math.min(1, Math.max(0, posY)) : 0.88,
        sizePercent: Number.isFinite(sizePercent)
            ? Math.min(36, Math.max(8, Math.round(sizePercent)))
            : 16,
    }
}

export const applyFinalTrademark = async (
    gallery,
    fields,
    { uploadedLogo } = {}
) => {
    const current = {
        ...DEFAULT_FINAL_TRADEMARK(),
        ...(gallery.finalTrademark?.toObject?.() ?? gallery.finalTrademark ?? {}),
    }
    const previousLogoUrl = current.logoUrl || ""

    if (fields.posX !== undefined) current.posX = fields.posX
    if (fields.posY !== undefined) current.posY = fields.posY
    if (fields.sizePercent !== undefined) current.sizePercent = fields.sizePercent

    if (uploadedLogo) {
        const logoError = validateTrademarkLogoFile(uploadedLogo)
        if (logoError) {
            const err = new Error(logoError)
            err.statusCode = 400
            throw err
        }
        current.logoUrl = await saveTrademarkLogoFile(
            gallery._id.toString(),
            uploadedLogo
        )
        if (previousLogoUrl && previousLogoUrl !== current.logoUrl) {
            deleteTrademarkLogoFile(previousLogoUrl)
        }
    } else if (fields.logoDataUrl) {
        current.logoUrl = await saveTrademarkLogoDataUrl(
            gallery._id.toString(),
            fields.logoDataUrl
        )
        if (previousLogoUrl && previousLogoUrl !== current.logoUrl) {
            deleteTrademarkLogoFile(previousLogoUrl)
        }
    } else if (fields.clearLogo) {
        deleteTrademarkLogoFile(previousLogoUrl)
        current.logoUrl = ""
    }

    gallery.finalTrademark = current
    gallery.markModified?.("finalTrademark")
    return gallery
}
