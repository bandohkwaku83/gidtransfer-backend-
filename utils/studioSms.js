import User from "../models/User.js"
import { sendArkeselSms, ArkeselSmsError } from "../services/arkeselSms.js"
import { normalizePhoneForSms } from "./phoneNumber.js"
import {
    normalizeSmsSenderId,
    suggestSmsSenderIdFromCompanyName,
    validateSmsSenderId,
} from "./smsSenderId.js"

export { ArkeselSmsError }

export const defaultPlatformSmsSender = () =>
    process.env.ARKESEL_DEFAULT_SENDER?.trim() || ""

export const formatSmsSenderFields = (studio) => {
    const s = studio ?? {}
    const smsSenderId = s.smsSenderId?.trim() || ""
    const smsSenderStatus = s.smsSenderStatus || "none"
    const companyName = s.companyName?.trim() || ""
    const suggestedSmsSenderId =
        smsSenderId ||
        (companyName ? suggestSmsSenderIdFromCompanyName(companyName) : "") ||
        null

    return {
        ...(smsSenderId ? { smsSenderId } : {}),
        smsSenderStatus,
        ...(s.smsSenderRequestedAt
            ? { smsSenderRequestedAt: s.smsSenderRequestedAt }
            : {}),
        ...(s.smsSenderApprovedAt
            ? { smsSenderApprovedAt: s.smsSenderApprovedAt }
            : {}),
        ...(s.smsSenderRejectedReason?.trim()
            ? { smsSenderRejectedReason: s.smsSenderRejectedReason.trim() }
            : {}),
        ...(suggestedSmsSenderId ? { suggestedSmsSenderId } : {}),
        smsBrandingReady: smsSenderStatus === "approved" && Boolean(smsSenderId),
    }
}

export const resolveSmsSenderForStudio = (studio) => {
    const s = studio ?? {}
    const requested = s.smsSenderId?.trim()
    const status = s.smsSenderStatus || "none"

    if (requested && status === "approved") {
        return requested
    }

    return defaultPlatformSmsSender() || null
}

export const assertSmsSenderIdAvailable = async (senderId, { excludeUserId } = {}) => {
    const normalized = normalizeSmsSenderId(senderId)
    if (!normalized) return

    const filter = { "studio.smsSenderId": normalized }
    if (excludeUserId) {
        filter._id = { $ne: excludeUserId }
    }

    const existing = await User.findOne(filter).select("_id studio.companyName")
    if (existing) {
        const err = new Error("This SMS display name is already taken")
        err.statusCode = 409
        throw err
    }
}

export const applySmsSenderIdToStudio = async (
    studio,
    rawSenderId,
    { userId, partial = false } = {}
) => {
    if (rawSenderId === undefined) {
        if (!partial) {
            const err = new Error("SMS display name is required")
            err.statusCode = 400
            throw err
        }
        return
    }

    const validation = validateSmsSenderId(rawSenderId)
    if (validation.error) {
        const err = new Error(validation.error)
        err.statusCode = 400
        throw err
    }

    const nextId = validation.value
    const currentId = normalizeSmsSenderId(studio.smsSenderId)
    const currentStatus = studio.smsSenderStatus || "none"
    if (currentId === nextId && currentStatus !== "rejected") {
        return
    }

    await assertSmsSenderIdAvailable(nextId, { excludeUserId: userId })

    studio.smsSenderId = nextId
    studio.smsSenderStatus = "pending"
    studio.smsSenderRequestedAt = new Date()
    studio.smsSenderApprovedAt = undefined
    studio.smsSenderRejectedReason = ""
}

export const approveStudioSmsSender = (studio) => {
    if (!studio?.smsSenderId?.trim()) {
        const err = new Error("Studio has no SMS display name to approve")
        err.statusCode = 400
        throw err
    }
    studio.smsSenderStatus = "approved"
    studio.smsSenderApprovedAt = new Date()
    studio.smsSenderRejectedReason = ""
}

export const rejectStudioSmsSender = (studio, reason = "") => {
    if (!studio?.smsSenderId?.trim()) {
        const err = new Error("Studio has no SMS display name to reject")
        err.statusCode = 400
        throw err
    }
    studio.smsSenderStatus = "rejected"
    studio.smsSenderApprovedAt = undefined
    studio.smsSenderRejectedReason = String(reason ?? "").trim()
}

const brandMessageForStudio = (studio, message) => {
    const text = String(message ?? "").trim()
    const companyName = studio?.companyName?.trim()
    const status = studio?.smsSenderStatus || "none"

    if (status === "approved" || !companyName) {
        return text
    }

    const prefix = `${companyName}: `
    if (text.toLowerCase().startsWith(companyName.toLowerCase())) {
        return text
    }
    return `${prefix}${text}`
}

export const sendStudioSms = async ({ studio, to, message }) => {
    const recipient = normalizePhoneForSms(to)
    if (!recipient) {
        throw new ArkeselSmsError("Invalid phone number for SMS", {
            code: "INVALID_PHONE",
        })
    }

    const sender = resolveSmsSenderForStudio(studio)
    if (!sender) {
        throw new ArkeselSmsError(
            "No SMS sender is available. Configure ARKESEL_DEFAULT_SENDER or approve the studio sender ID.",
            { code: "NO_SENDER" }
        )
    }

    const brandedMessage = brandMessageForStudio(studio, message)
    const result = await sendArkeselSms({
        sender,
        message: brandedMessage,
        recipients: [recipient],
    })

    return {
        recipient,
        sender,
        message: brandedMessage,
        usedStudioBranding: studio?.smsSenderStatus === "approved",
        result,
    }
}

export const buildGalleryShareSmsMessage = ({
    studioName,
    galleryName,
    shareUrl,
}) => {
    const brand = studioName?.trim() || "Your photographer"
    const title = galleryName?.trim() || "your gallery"
    return `${brand}: Your gallery "${title}" is ready. View it here: ${shareUrl}`
}
