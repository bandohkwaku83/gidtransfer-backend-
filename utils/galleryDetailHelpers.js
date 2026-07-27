import mongoose from "mongoose"
import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GallerySet from "../models/GallerySet.js"
import User from "../models/User.js"
import {
    galleryNotDeletedFilter,
    galleryOwnerFilter,
    formatGalleryResponse,
    formatGallerySetsSettingsResponse,
} from "./galleryFields.js"
import { buildGalleryShareUrl } from "./galleryShareUrl.js"
import { resolveMediaUrl } from "./formatUserResponse.js"
import {
    galleryPhotoPublicUrl,
} from "./galleryPhotoStorage.js"
import { galleryFinalPublicUrl } from "./galleryFinalStorage.js"
import { photoDerivativesReady } from "./galleryDerivativeQueue.js"
import { videoStreamingReady } from "./galleryVideoQueue.js"
import { formatFeedbackResponse } from "./feedbackThread.js"
import {
    formatGalleryClientAccessResponse,
    formatGalleryDesignResponse,
    formatGalleryShareDesignSnapshot,
} from "./galleryDesignFields.js"
import {
    backfillGallerySlug,
    ensureUserCompanySlug,
} from "./gallerySlugHelpers.js"

export const ownedGalleryFilter = (id, userId) => ({
    _id: id,
    ...galleryOwnerFilter(userId),
})

export async function loadOwnedGallery(id, userId) {
    if (!mongoose.isValidObjectId(id)) return null
    return Gallery.findOne({
        ...ownedGalleryFilter(id, userId),
        ...galleryNotDeletedFilter(),
    })
}

export async function attachGalleryStats(galleryId) {
    const gid = galleryId
    const [uploadCount, selectionCount, finalCount] = await Promise.all([
        GalleryPhoto.countDocuments({ gallery: gid, deletedAt: null }),
        GalleryPhoto.countDocuments({
            gallery: gid,
            selectedByClient: true,
        }),
        GalleryFinal.countDocuments({ gallery: gid, deletedAt: null }),
    ])
    return { uploadCount, selectionCount, finalCount }
}

export async function resolveShareContext(gallery) {
    const owner = await User.findById(gallery.owner).select("studio")
    if (!owner) return { companySlug: null, shareUrl: null }

    const companySlug = await ensureUserCompanySlug(owner)
    const gallerySlug = await backfillGallerySlug(gallery)

    return {
        companySlug,
        gallerySlug,
        shareUrl: buildGalleryShareUrl(companySlug, gallerySlug),
    }
}

const formatGalleryDetailFields = (galleryDoc) => {
    const plain = galleryDoc.toObject?.() ?? galleryDoc
    return {
        coverFocalX: plain.coverFocalX ?? 50,
        coverFocalY: plain.coverFocalY ?? 50,
        shareUseDefaultCover: plain.shareUseDefaultCover ?? null,
        shareCoverImageUrl: plain.shareCoverImageUrl ?? null,
        shareCoverFocalX: plain.shareCoverFocalX ?? null,
        shareCoverFocalY: plain.shareCoverFocalY ?? null,
        ...formatGalleryShareDesignSnapshot(plain),
        backgroundMusicUrl: plain.backgroundMusicUrl ?? null,
        backgroundMusicEnabled: plain.backgroundMusicEnabled === true,
        design: formatGalleryDesignResponse(plain),
        ...formatGalleryDesignResponse(plain),
        clientAccess: formatGalleryClientAccessResponse(plain),
        passwordProtected: plain.passwordProtected === true,
        allowDownloads: plain.allowDownloads !== false,
        emailGateEnabled: plain.emailGateEnabled === true,
        requireEmailToView: plain.emailGateEnabled === true,
        maxSelections: plain.maxSelections ?? null,
        selectionSubmittedAt: plain.selectionSubmittedAt ?? null,
        selectionLocked: plain.selectionLocked === true,
        finalDeliveryEnabled: plain.finalDeliveryEnabled !== false,
        watermarkPreviewEnabled: plain.watermarkPreviewEnabled === true,
        watermarkFinalsEnabled: plain.watermarkFinalsEnabled === true,
        ...formatGallerySetsSettingsResponse(plain),
    }
}

/** Fast gallery payload for PATCH/settings endpoints (no stats or share URL rebuild). */
export const formatGalleryPatchResponse = (galleryDoc) => {
    const base = formatGalleryResponse(galleryDoc)
    const plain = galleryDoc.toObject?.() ?? galleryDoc
    return {
        ...base,
        slug: plain.slug ?? null,
        ...formatGalleryDetailFields(galleryDoc),
    }
}

export const formatGalleryDetailResponse = async (galleryDoc) => {
    const base = formatGalleryResponse(galleryDoc)
    const stats = await attachGalleryStats(galleryDoc._id ?? galleryDoc.id)
    const share = await resolveShareContext(galleryDoc)
    const plain = galleryDoc.toObject?.() ?? galleryDoc

    return {
        ...base,
        slug: share.gallerySlug ?? plain.slug ?? null,
        companySlug: share.companySlug,
        shareUrl: share.shareUrl,
        ...formatGalleryDetailFields(galleryDoc),
        stats,
    }
}

export const formatGallerySetResponse = (doc) => {
    const s = doc.toObject?.() ?? doc
    return {
        id: String(s._id ?? s.id),
        galleryId: String(s.gallery),
        name: s.name ?? "",
        sortOrder: typeof s.sortOrder === "number" ? s.sortOrder : 0,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
    }
}

function groupGalleryMediaBySetId(docs) {
    const map = new Map()
    for (const doc of docs) {
        const setId = doc.set ? String(doc.set) : null
        if (!setId) continue
        if (!map.has(setId)) map.set(setId, [])
        map.get(setId).push(doc)
    }
    return map
}

/** Client share gallery — sets with nested uploads and finals. */
export const buildPublicGallerySetsResponse = (
    setRows,
    photos,
    finals,
    { formatPhoto, formatFinal } = {}
) => {
    const photosBySet = groupGalleryMediaBySetId(photos)
    const finalsBySet = groupGalleryMediaBySetId(finals)

    return setRows.map((row) => {
        const id = String(row._id ?? row.id)
        const setPhotos = photosBySet.get(id) ?? []
        const setFinals = finalsBySet.get(id) ?? []
        return {
            ...formatGallerySetResponse(row),
            photos: setPhotos.map(formatPhoto),
            finals: setFinals.map(formatFinal),
            counts: {
                uploads: setPhotos.length,
                finals: setFinals.length,
            },
        }
    })
}

/** Resolve optional set id from multipart body; validates ownership when provided. */
export async function resolveGallerySetIdForUpload(galleryId, body) {
    const raw = body?.setId ?? body?.set_id
    if (raw === undefined) {
        return { setId: undefined }
    }
    if (raw == null || raw === "" || raw === "null" || raw === "unsorted") {
        return { setId: null }
    }
    const id = String(raw).trim()
    if (!mongoose.isValidObjectId(id)) {
        return { error: "Invalid set id" }
    }
    const row = await GallerySet.findOne({ _id: id, gallery: galleryId }).exec()
    if (!row) {
        return { error: "Set not found in this gallery" }
    }
    return { setId: row._id }
}

export const formatGalleryPhotoResponse = (
    doc,
    { absoluteUrls = false, watermarkPreviewEnabled = false, includeAi = false } = {}
) => {
    const p = doc.toObject?.() ?? doc
    const galleryId = String(p.gallery)
    const resolve = (relativePath) => {
        if (!relativePath?.trim()) return undefined
        return absoluteUrls ? resolveMediaUrl(relativePath) : relativePath
    }

    const url = resolve(
        p.storedFilename
            ? galleryPhotoPublicUrl(galleryId, p.storedFilename)
            : p.url
    )
    const thumbRelative = p.thumbStoredFilename
        ? galleryPhotoPublicUrl(galleryId, p.thumbStoredFilename)
        : undefined
    const displayRelative = p.previewWmStoredFilename
        ? galleryPhotoPublicUrl(galleryId, p.previewWmStoredFilename)
        : undefined
    const posterRelative = p.posterStoredFilename
        ? galleryPhotoPublicUrl(galleryId, p.posterStoredFilename)
        : undefined
    const dashRelative = p.dashManifestStoredFilename
        ? galleryPhotoPublicUrl(galleryId, p.dashManifestStoredFilename)
        : undefined

    const thumbUrl = resolve(thumbRelative)
    const displayUrl = displayRelative ? resolve(displayRelative) : undefined
    const posterUrl = posterRelative ? resolve(posterRelative) : undefined
    const dashUrl = dashRelative ? resolve(dashRelative) : undefined

    const response = {
        id: p._id ?? p.id,
        galleryId,
        originalFilename: p.originalFilename,
        url,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes,
        isVideo: p.isVideo === true,
        derivativesReady: photoDerivativesReady(p),
        streamingReady: videoStreamingReady(p),
        dashStatus: p.dashStatus ?? null,
        setId: p.set ? String(p.set) : null,
        sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : 0,
        deletedAt: p.deletedAt ?? null,
        restoreDeadline: p.restoreDeadline ?? null,
        selectedByClient: p.selectedByClient === true,
        rejectedByClient: p.rejectedByClient === true,
        rejectedAt: p.rejectedAt ?? null,
        ...formatFeedbackResponse(p),
        selectedAt: p.selectedAt ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
    }

    if (thumbUrl) response.thumbUrl = thumbUrl
    if (displayUrl) response.displayUrl = displayUrl
    if (posterUrl) response.posterUrl = posterUrl
    if (dashUrl) response.dashUrl = dashUrl

    // gridUrl / viewUrl always point at full-resolution originals unless a
    // watermarked client preview is explicitly enabled for viewUrl.
    // Videos prefer poster for grid when available.
    response.gridUrl = posterUrl && p.isVideo === true ? posterUrl : url
    response.viewUrl =
        watermarkPreviewEnabled && displayUrl ? displayUrl : url

    if (includeAi) {
        const ai = formatPublicGalleryPhotoAiResponse(doc)
        if (ai) response.ai = ai
    }

    return response
}

/** Grid/list tile payload — full-resolution URLs; thumbUrl remains optional when generated. */
export const formatGalleryPhotoGridResponse = (
    doc,
    options = {}
) => {
    const full = formatGalleryPhotoResponse(doc, options)
    return {
        id: full.id,
        galleryId: full.galleryId,
        originalFilename: full.originalFilename,
        url: full.url,
        thumbUrl: full.thumbUrl,
        posterUrl: full.posterUrl,
        dashUrl: full.dashUrl,
        gridUrl: full.gridUrl,
        viewUrl: full.viewUrl,
        sortOrder: full.sortOrder,
        setId: full.setId,
        isVideo: full.isVideo,
        derivativesReady: full.derivativesReady,
        streamingReady: full.streamingReady,
        dashStatus: full.dashStatus,
    }
}

/** Client-facing AI selection hints (public gallery only). */
export const formatPublicGalleryPhotoAiResponse = (doc) => {
    const p = doc.toObject?.() ?? doc
    const ai = p.aiAnalysis ?? {}
    if (!ai.status) return null

    return {
        status: ai.status,
        suggested: ai.suggested === true,
        qualityScore: ai.qualityScore ?? null,
        sceneLabel: ai.sceneLabel ?? null,
        tags: Array.isArray(ai.tags) ? ai.tags : [],
        issues: Array.isArray(ai.issues) ? ai.issues : [],
        faceCount: ai.faceCount ?? null,
        eyesOpen: ai.eyesOpen ?? null,
        isBlurry: ai.isBlurry === true,
        duplicateGroupId: ai.duplicateGroupId ?? null,
        isBestInGroup: ai.isBestInGroup !== false,
        suggestionScore: ai.suggestionScore ?? null,
        suggestionReason: ai.suggestionReason ?? null,
    }
}

/** Client gallery — keep selected picks visible after raw upload trash. */
export const formatPublicGalleryPhotoResponse = (
    doc,
    { absoluteUrls = false, watermarkPreviewEnabled = false } = {}
) => {
    const base = formatGalleryPhotoResponse(doc, {
        absoluteUrls,
        watermarkPreviewEnabled,
    })
    const ai = formatPublicGalleryPhotoAiResponse(doc)
    const withAi = ai ? { ...base, ai } : base
    if (base.selectedByClient && base.deletedAt) {
        return {
            ...withAi,
            removedFromBrowse: true,
            deletedAt: null,
            restoreDeadline: null,
        }
    }
    return withAi
}

export const formatGalleryFinalResponse = (doc, { absoluteUrls = false } = {}) => {
    const p = doc.toObject?.() ?? doc
    const galleryId = String(p.gallery)
    const relativeUrl = p.storedFilename
        ? galleryFinalPublicUrl(galleryId, p.storedFilename)
        : p.url
    const url = absoluteUrls ? resolveMediaUrl(relativeUrl) : relativeUrl
    const resolve = (relativePath) => {
        if (!relativePath?.trim()) return undefined
        return absoluteUrls ? resolveMediaUrl(relativePath) : relativePath
    }
    const posterUrl = resolve(
        p.posterStoredFilename
            ? galleryFinalPublicUrl(galleryId, p.posterStoredFilename)
            : undefined
    )
    const dashUrl = resolve(
        p.dashManifestStoredFilename
            ? galleryFinalPublicUrl(galleryId, p.dashManifestStoredFilename)
            : undefined
    )
    return {
        id: p._id ?? p.id,
        galleryId: String(p.gallery),
        originalFilename: p.originalFilename,
        url,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes,
        isVideo: p.isVideo === true,
        streamingReady: videoStreamingReady(p),
        dashStatus: p.dashStatus ?? null,
        ...(posterUrl ? { posterUrl } : {}),
        ...(dashUrl ? { dashUrl } : {}),
        setId: p.set ? String(p.set) : null,
        sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : 0,
        deletedAt: p.deletedAt ?? null,
        restoreDeadline: p.restoreDeadline ?? null,
        isLocked: p.isLocked === true,
        outstandingBalanceGhs: p.outstandingBalanceGhs ?? null,
        clientPaid: p.clientPaid !== false,
        ...formatFeedbackResponse(p),
        flaggedByClient: p.flaggedByClient === true,
        flaggedAt: p.flaggedAt ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
    }
}

/** Client-facing final: omits download URL when locked or downloads disabled. */
export const formatPublicGalleryFinalResponse = (doc, { allowDownloads = true } = {}) => {
    const base = formatGalleryFinalResponse(doc, { absoluteUrls: true })
    const downloadsAllowed = allowDownloads !== false && !base.isLocked
    if (!downloadsAllowed) {
        return {
            ...base,
            downloadUrl: null,
            downloadsEnabled: false,
        }
    }
    return {
        ...base,
        downloadUrl: base.url,
        downloadsEnabled: true,
    }
}
