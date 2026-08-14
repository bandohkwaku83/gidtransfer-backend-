import { isGalleryVideoMime } from "./galleryMediaTypes.js"
import { formatBytesLabel } from "./storageFields.js"
import { getEffectiveVideoUploadLimitBytes, getUserPlanId } from "./planCatalog.js"
import {
    featureDeniedPayload,
    userHasFeature,
} from "./planFeatures.js"
import { getOwnerStorageBreakdown } from "./storageUsage.js"

/** Video bytes in active galleries (same scope as GET /api/storage). */
export const getOwnerVideoUsedBytes = async (ownerId) => {
    if (!ownerId) return 0
    const breakdown = await getOwnerStorageBreakdown(ownerId)
    return Number(breakdown.videoUsedBytes) || 0
}

export const videoBytesFromFiles = (files = []) =>
    files.reduce((sum, file) => {
        const mime = file?.mimeType ?? file?.mimetype
        const size = Number(file?.sizeBytes ?? file?.size ?? 0)
        if (!Number.isFinite(size) || size <= 0) return sum
        if (file?.isVideo === true || isGalleryVideoMime(mime)) {
            return sum + size
        }
        return sum
    }, 0)

/**
 * @returns {null | object} denial payload for 403, or null if allowed
 */
export const videoUploadDeniedPayload = async (
    user,
    extraVideoBytes = 0,
    { replacingBytes = 0 } = {}
) => {
    if (!userHasFeature(user, "videoUploads")) {
        return featureDeniedPayload("videoUploads", { user })
    }

    const incoming = Math.max(0, Number(extraVideoBytes) || 0)
    if (incoming <= 0) return null

    const limit = getEffectiveVideoUploadLimitBytes(user)
    const used = await getOwnerVideoUsedBytes(user._id)
    const credit = Math.max(0, Number(replacingBytes) || 0)
    const next = used - credit + incoming
    if (next <= limit) return null

    return {
        message: `Video storage limit reached (${formatBytesLabel(limit)} on this plan). Upgrade for more video space.`,
        code: "VIDEO_LIMIT_REACHED",
        feature: "videoUploads",
        videoUsedBytes: used,
        videoUploadLimitBytes: limit,
        incomingBytes: incoming,
        currentPlanId: user ? getUserPlanId(user) : null,
    }
}

export const sendVideoUploadDenied = (res, payload) =>
    res.status(403).json(payload)
