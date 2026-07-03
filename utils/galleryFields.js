import mongoose from "mongoose"
import Gallery, { GALLERY_STATUSES } from "../models/Gallery.js"
import { buildGalleryShareUrl } from "./galleryShareUrl.js"
import { formatClientEmbed } from "./clientFields.js"
import {
    formatGalleryClientAccessResponse,
    formatGalleryDesignResponse,
    formatGalleryShareDesignSnapshot,
} from "./galleryDesignFields.js"
import {
    normalizeShootCategory,
    shootTypeLabel,
} from "./bookingShootTypes.js"

export const galleryOwnerFilter = (userId) => ({
    owner: userId,
})

export const galleryNotDeletedFilter = () => ({
    deletedAt: null,
})

export const galleryTrashedOnlyFilter = () => ({
    deletedAt: { $ne: null },
})

/** Client heart-picks — remain visible after raw upload is trashed. */
export const galleryClientSelectionPhotoFilter = (galleryId) => ({
    gallery: galleryId,
    selectedByClient: true,
})

export const galleryClientSelectionPhotoSort = { selectedAt: 1, createdAt: 1 }

/** Public/client browse grid — active uploads only. */
export const galleryPublicBrowsePhotoFilter = (galleryId) => ({
    gallery: galleryId,
    deletedAt: null,
})

/** Public API: load photo for selection toggle or comments. */
export const galleryPublicPhotoAccessFilter = (galleryId, photoId) => ({
    _id: photoId,
    gallery: galleryId,
    $or: [{ deletedAt: null }, { selectedByClient: true }],
})

/** Include client picks trashed from raw upload so client apps using `photos` still see them. */
export const mergePublicGalleryBrowsePhotos = (browsePhotos, selectedPhotos) => {
    const browseIds = new Set(
        browsePhotos.map((photo) => String(photo._id ?? photo.id))
    )
    const selectedOnly = selectedPhotos.filter(
        (photo) => !browseIds.has(String(photo._id ?? photo.id))
    )
    return [...browsePhotos, ...selectedOnly]
}

export const computeShareActive = (doc) => {
    if (!doc?.shareToken) return false
    if (!doc.shareExpiresAt) return true
    return doc.shareExpiresAt.getTime() > Date.now()
}

export const parseEventDateInput = (value) => {
    if (value === undefined || value === null) return { error: null, date: null }
    const raw =
        typeof value === "string"
            ? value.trim()
            : value instanceof Date
              ? value.toISOString().slice(0, 10)
              : ""

    if (!raw) {
        return { error: "Invalid or missing event date", date: null }
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const parsed = new Date(`${raw}T12:00:00.000Z`)
        if (Number.isNaN(parsed.getTime())) {
            return { error: "Invalid event date", date: null }
        }
        return { error: null, date: parsed }
    }

    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) {
        return { error: "Invalid event date", date: null }
    }
    return { error: null, date: d }
}

export const parseShareLinkExpiryDays = (value) => {
    if (value === undefined) return { error: null, omitted: true, days: null }
    if (value === null) {
        return { error: null, omitted: false, days: null }
    }

    const n = Number(value)
    if (!Number.isInteger(n) || n < 1) {
        return {
            error: "share_link_expiry_days must be null (never) or a positive integer",
            omitted: false,
            days: null,
        }
    }
    return { error: null, omitted: false, days: n }
}

/** True when the client wants the server to overwrite/fill description using AI from the event name and gallery type. */
export const parseGenerateDescriptionAi = (body) => {
    if (!body || typeof body !== "object") return false
    const raw = body.generate_description_ai ?? body.generateDescriptionAi
    if (raw === undefined || raw === "" || raw === null) return false
    if (typeof raw === "boolean") return raw
    const s = String(raw).trim().toLowerCase()
    return s === "true" || s === "1" || s === "yes"
}

export const parseGalleryInput = (body, { partial = false } = {}) => {
    const {
        name,
        clientId,
        eventDate,
        event_date,
        description,
        status,
        share_link_expiry_days: shareExpirySnake,
        shareLinkExpiryDays: shareExpiryCamel,
        use_default_cover: useDefaultSnake,
        useDefaultCover: useDefaultCamel,
        slug,
        gallery_slug: gallerySlugSnake,
        gallerySlug: gallerySlugCamel,
        gallery_type: galleryTypeSnake,
        galleryType: galleryTypeCamel,
    } = body

    const fields = {}
    const errors = []

    if (name !== undefined || !partial) {
        const trimmed = name?.trim?.()
        if (!trimmed) {
            if (!partial) errors.push("Event name is required")
        } else {
            fields.name = trimmed
        }
    }

    if (clientId !== undefined || !partial) {
        const id = clientId?.trim?.() ? String(clientId).trim() : clientId
        if (!id) {
            if (!partial) errors.push("Client is required")
        } else if (!mongoose.isValidObjectId(id)) {
            errors.push("Invalid client id")
        } else {
            fields.clientId = String(id)
        }
    }

    const dateRaw = eventDate ?? event_date
    if (!partial) {
        const parsed = parseEventDateInput(dateRaw)
        if (!parsed.date) {
            errors.push(parsed.error ?? "Event date is required")
        } else {
            fields.eventDate = parsed.date
        }
    } else if (dateRaw !== undefined) {
        const parsed = parseEventDateInput(dateRaw)
        if (parsed.error || !parsed.date) {
            errors.push(parsed.error ?? "Invalid event date")
        } else {
            fields.eventDate = parsed.date
        }
    }

    if (description !== undefined) {
        fields.description =
            description === null || description === ""
                ? ""
                : String(description).trim()
    }

    const slugRaw = slug ?? gallerySlugSnake ?? gallerySlugCamel
    if (slugRaw !== undefined) {
        const trimmed = String(slugRaw).trim()
        if (!trimmed) {
            errors.push("Gallery URL slug cannot be empty")
        } else {
            fields.slug = trimmed
        }
    }

    const galleryTypeRaw = galleryTypeSnake ?? galleryTypeCamel
    if (galleryTypeRaw !== undefined) {
        if (galleryTypeRaw === null || galleryTypeRaw === "") {
            fields.galleryType = null
        } else {
            const normalized = normalizeShootCategory(String(galleryTypeRaw))
            if (normalized.error) {
                errors.push(
                    normalized.error.replace(/^Shoot type/, "Gallery type")
                )
            } else {
                fields.galleryType = normalized.category
            }
        }
    }

    if (status !== undefined) {
        const s =
            typeof status === "string" ? status.trim().toLowerCase() : status
        if (!GALLERY_STATUSES.includes(s)) {
            errors.push(`Status must be one of: ${GALLERY_STATUSES.join(", ")}`)
        } else {
            fields.status = s
        }
    }

    const shareRaw =
        shareExpirySnake !== undefined ? shareExpirySnake : shareExpiryCamel

    if (shareRaw !== undefined) {
        const parsed = parseShareLinkExpiryDays(shareRaw)
        if (parsed.error) errors.push(parsed.error)
        else if (!parsed.omitted) {
            fields.shareLinkExpiryDays = parsed.days
        }
    }

    const useRaw =
        useDefaultSnake !== undefined ? useDefaultSnake : useDefaultCamel
    if (useRaw !== undefined) {
        if (typeof useRaw === "boolean") {
            fields.useDefaultCover = useRaw
        } else if (typeof useRaw === "string") {
            const s = useRaw.trim().toLowerCase()
            if (s === "true" || s === "1") fields.useDefaultCover = true
            else if (s === "false" || s === "0") fields.useDefaultCover = false
            else errors.push("use_default_cover must be a boolean")
        } else {
            errors.push("use_default_cover must be a boolean")
        }
    }

    return { fields, errors }
}

const escapeRegex = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const buildGalleryListFilter = (
    userId,
    { status, search, trashOnly = false } = {}
) => {
    const statusFilterPart = {}
    if (
        status !== undefined &&
        status !== null &&
        String(status).trim() !== ""
    ) {
        const key = String(status).trim().toLowerCase()
        if (key === "all") {
            /* no status constraint */
        } else if (!GALLERY_STATUSES.includes(key)) {
            return { filter: null, error: "Invalid status filter" }
        } else {
            statusFilterPart.status = key
        }
    }

    const searchPart = {}
    if (search?.trim?.()) {
        const q = escapeRegex(search.trim())
        searchPart.$or = [
            { name: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
        ]
    }

    const deletionPart = trashOnly
        ? galleryTrashedOnlyFilter()
        : galleryNotDeletedFilter()

    const filter = {
        ...galleryOwnerFilter(userId),
        ...deletionPart,
        ...statusFilterPart,
        ...searchPart,
    }

    return { filter }
}

export const formatGallerySetsSettingsResponse = (galleryDoc) => {
    const plain = galleryDoc?.toObject?.() ?? galleryDoc ?? {}
    return {
        setsAllLabel:
            typeof plain.setsAllLabel === "string" && plain.setsAllLabel.trim()
                ? plain.setsAllLabel.trim()
                : "All",
        setsAllSortOrder:
            typeof plain.setsAllSortOrder === "number" &&
            Number.isFinite(plain.setsAllSortOrder)
                ? plain.setsAllSortOrder
                : 0,
    }
}

export const formatGalleryResponse = (galleryDoc) => {
    const plain = galleryDoc.toObject?.({ virtuals: true }) ?? galleryDoc
    const shareActive = computeShareActive(plain)

    /** @type {ReturnType<typeof formatClientEmbed>} */
    const clientBrief = formatClientEmbed(plain.client)

    const id = plain._id ?? plain.id
    const clientIdPlain = clientBrief?.id ?? null

    const displayCoverUrl =
        plain.useDefaultCover === true ? null : plain.coverImageUrl ?? null

    const companySlug =
        plain.owner?.studio?.companySlug ??
        plain.companySlug ??
        null
    const gallerySlug = plain.slug ?? null
    const shareUrl =
        companySlug && gallerySlug
            ? buildGalleryShareUrl(companySlug, gallerySlug)
            : null

    return {
        id,
        owner: plain.owner?._id ?? plain.owner,
        clientId: clientIdPlain,
        client: clientBrief,
        name: plain.name,
        eventName: plain.name,
        eventDate: plain.eventDate,
        description: plain.description ?? "",
        galleryType: plain.galleryType ?? null,
        galleryTypeLabel: plain.galleryType
            ? shootTypeLabel(plain.galleryType)
            : null,
        status: plain.status,
        slug: gallerySlug,
        companySlug,
        shareUrl,
        shareLinkExpiryDays: plain.shareLinkExpiryDays ?? null,
        useDefaultCover: plain.useDefaultCover !== false,
        coverImageUrl: plain.coverImageUrl ?? null,
        displayCoverUrl,
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
        maxSelections: plain.maxSelections ?? null,
        selectionSubmittedAt: plain.selectionSubmittedAt ?? null,
        selectionLocked: plain.selectionLocked === true,
        finalDeliveryEnabled: plain.finalDeliveryEnabled !== false,
        watermarkPreviewEnabled: plain.watermarkPreviewEnabled === true,
        watermarkFinalsEnabled: plain.watermarkFinalsEnabled === true,
        ...formatGallerySetsSettingsResponse(plain),
        shareToken: plain.shareToken ?? null,
        shareExpiresAt: plain.shareExpiresAt ?? null,
        isShared: shareActive,
        deletedAt: plain.deletedAt ?? null,
        restoreDeadline: plain.restoreDeadline ?? null,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
    }
}

export const attachGalleryCounts = async (ownerId) => {
    const activeBase = {
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
    }

    const [all, draft, selecting, done, trash] = await Promise.all([
        Gallery.countDocuments(activeBase),
        Gallery.countDocuments({ ...activeBase, status: "draft" }),
        Gallery.countDocuments({ ...activeBase, status: "selecting" }),
        Gallery.countDocuments({ ...activeBase, status: "done" }),
        Gallery.countDocuments({
            ...galleryOwnerFilter(ownerId),
            ...galleryTrashedOnlyFilter(),
        }),
    ])

    return { all, draft, selecting, done, trash }
}
