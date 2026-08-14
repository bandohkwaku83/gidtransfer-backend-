import mongoose from "mongoose"
import User from "../models/User.js"
import Client from "../models/Client.js"
import {
    computeShareActive,
    formatGalleryResponse,
    galleryNotDeletedFilter,
    galleryTrashedOnlyFilter,
} from "./galleryFields.js"
import {
    effectiveRestoreDeadline,
    isRestoreExpired,
} from "./galleryTrash.js"
import { GALLERY_STATUSES } from "../models/Gallery.js"

const escapeRegex = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const parseBooleanQuery = (value) => {
    if (value === undefined || value === null || value === "") return null
    const raw = String(value).trim().toLowerCase()
    if (raw === "true" || raw === "1" || raw === "yes") return true
    if (raw === "false" || raw === "0" || raw === "no") return false
    return null
}

const parseDateBoundary = (value, { endOfDay = false } = {}) => {
    if (value === undefined || value === null || String(value).trim() === "") {
        return null
    }
    const raw = String(value).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    }
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
}

export const buildAdminGalleryListFilter = async (query = {}) => {
    const filter = {}
    const errors = []

    const trashOnly = parseBooleanQuery(query.trashOnly ?? query.trashed)
    if (trashOnly === true) {
        Object.assign(filter, galleryTrashedOnlyFilter())
    } else if (trashOnly === false || query.includeTrash !== "true") {
        Object.assign(filter, galleryNotDeletedFilter())
    }

    const status = String(query.status ?? "").trim().toLowerCase()
    if (status && status !== "all") {
        if (!GALLERY_STATUSES.includes(status)) {
            errors.push("Invalid status filter")
        } else {
            filter.status = status
        }
    }

    const passwordProtected = parseBooleanQuery(
        query.passwordProtected ?? query.hasPassword
    )
    if (passwordProtected !== null) {
        filter.passwordProtected = passwordProtected
    }

    const selectionLocked = parseBooleanQuery(query.selectionLocked)
    if (selectionLocked !== null) {
        filter.selectionLocked = selectionLocked
    }

    const allowDownloads = parseBooleanQuery(query.allowDownloads)
    if (allowDownloads !== null) {
        filter.allowDownloads = allowDownloads
    }

    const shared = parseBooleanQuery(query.shared ?? query.isShared)
    if (shared === true) {
        filter.shareToken = { $type: "string", $gt: "" }
        filter.$and = [
            ...(filter.$and ?? []),
            {
                $or: [
                    { shareExpiresAt: null },
                    { shareExpiresAt: { $gt: new Date() } },
                ],
            },
        ]
    } else if (shared === false) {
        filter.$and = [
            ...(filter.$and ?? []),
            {
                $or: [
                    { shareToken: { $exists: false } },
                    { shareToken: null },
                    { shareToken: "" },
                    { shareExpiresAt: { $lte: new Date() } },
                ],
            },
        ]
    }

    const dateFrom = parseDateBoundary(
        query.dateFrom ?? query.from ?? query.eventDateFrom
    )
    const dateTo = parseDateBoundary(
        query.dateTo ?? query.to ?? query.eventDateTo,
        { endOfDay: true }
    )
    if (dateFrom || dateTo) {
        filter.eventDate = {}
        if (dateFrom) filter.eventDate.$gte = dateFrom
        if (dateTo) filter.eventDate.$lte = dateTo
    }

    const slug = String(query.slug ?? query.shareSlug ?? "").trim()
    if (slug) {
        filter.slug = new RegExp(`^${escapeRegex(slug)}$`, "i")
    }

    const studioEmail = String(query.studioEmail ?? query.email ?? "").trim()
    const ownerId = String(query.ownerId ?? query.userId ?? query.studioId ?? "").trim()
    const clientName = String(query.clientName ?? "").trim()
    const search = String(query.search ?? query.q ?? "").trim()

    let ownerIds = null

    if (ownerId) {
        if (!mongoose.isValidObjectId(ownerId)) {
            errors.push("Invalid ownerId")
        } else {
            ownerIds = [new mongoose.Types.ObjectId(ownerId)]
        }
    }

    if (studioEmail) {
        const owners = await User.find({
            email: new RegExp(`^${escapeRegex(studioEmail)}$`, "i"),
        })
            .select("_id")
            .lean()
            .exec()
        const ids = owners.map((u) => u._id)
        ownerIds = ownerIds
            ? ownerIds.filter((id) => ids.some((x) => String(x) === String(id)))
            : ids
        if (!ownerIds.length) {
            return { filter: { _id: { $exists: false } }, errors }
        }
    }

    if (clientName) {
        const clients = await Client.find({
            name: new RegExp(escapeRegex(clientName), "i"),
        })
            .select("_id")
            .lean()
            .exec()
        const clientIds = clients.map((c) => c._id)
        if (!clientIds.length) {
            return { filter: { _id: { $exists: false } }, errors }
        }
        filter.client = { $in: clientIds }
    }

    if (search && !slug && !studioEmail && !clientName) {
        const [owners, clients] = await Promise.all([
            User.find({
                $or: [
                    { email: new RegExp(escapeRegex(search), "i") },
                    { "studio.companyName": new RegExp(escapeRegex(search), "i") },
                    { "studio.companySlug": new RegExp(escapeRegex(search), "i") },
                ],
            })
                .select("_id")
                .lean()
                .exec(),
            Client.find({
                name: new RegExp(escapeRegex(search), "i"),
            })
                .select("_id")
                .lean()
                .exec(),
        ])

        filter.$or = [
            { name: new RegExp(escapeRegex(search), "i") },
            { slug: new RegExp(escapeRegex(search), "i") },
            { owner: { $in: owners.map((u) => u._id) } },
            { client: { $in: clients.map((c) => c._id) } },
        ]
    }

    if (ownerIds) {
        filter.owner = { $in: ownerIds }
    }

    return { filter, errors }
}

export const formatAdminGalleryListRow = (galleryDoc, ownerDoc = null) => {
    const base = formatGalleryResponse(galleryDoc)
    const owner = ownerDoc ?? galleryDoc.owner
    const ownerPlain = owner?.toObject?.() ?? owner ?? {}

    return {
        id: base.id,
        name: base.name,
        slug: base.slug,
        status: base.status,
        eventDate: base.eventDate,
        galleryType: base.galleryType,
        galleryTypeLabel: base.galleryTypeLabel,
        client: base.client
            ? {
                  id: base.client.id,
                  name: base.client.name,
              }
            : null,
        studio: {
            userId: ownerPlain._id ?? ownerPlain.id ?? base.owner,
            email: ownerPlain.email ?? null,
            companyName: ownerPlain.studio?.companyName?.trim?.() || "",
            companySlug:
                ownerPlain.studio?.companySlug?.trim?.() ||
                base.companySlug ||
                "",
        },
        share: {
            url: base.shareUrl,
            isShared: base.isShared,
            passwordProtected: base.passwordProtected,
            shareExpiresAt: base.shareExpiresAt,
            shareLinkExpiryDays: base.shareLinkExpiryDays,
            allowDownloads: base.allowDownloads,
        },
        selectionLocked: base.selectionLocked,
        maxSelections: base.maxSelections,
        selectionSubmittedAt: base.selectionSubmittedAt,
        deletedAt: base.deletedAt,
        restoreDeadline: base.restoreDeadline,
        createdAt: base.createdAt,
        updatedAt: base.updatedAt,
    }
}

export const formatAdminGalleryDetail = ({
    gallery,
    owner,
    galleryCounts = null,
}) => {
    const base = formatGalleryResponse(gallery)
    const ownerPlain = owner?.toObject?.() ?? owner ?? {}
    const shareActive = computeShareActive(gallery)

    return {
        ...base,
        client: base.client
            ? {
                  id: base.client.id,
                  name: base.client.name,
                  // PII omitted by default on gallery inspector detail
              }
            : null,
        studio: {
            userId: ownerPlain._id ?? ownerPlain.id ?? null,
            email: ownerPlain.email ?? null,
            companyName: ownerPlain.studio?.companyName?.trim?.() || "",
            companySlug: ownerPlain.studio?.companySlug?.trim?.() || "",
            isActive: ownerPlain.isActive !== false,
        },
        photographerGalleryCounts: galleryCounts,
        share: {
            url: base.shareUrl,
            tokenPresent: Boolean(base.shareToken),
            isShared: shareActive,
            passwordProtected: base.passwordProtected,
            shareExpiresAt: base.shareExpiresAt,
            shareLinkExpiryDays: base.shareLinkExpiryDays,
            allowDownloads: base.allowDownloads,
        },
        selection: {
            locked: base.selectionLocked,
            maxSelections: base.maxSelections,
            submittedAt: base.selectionSubmittedAt,
        },
        trash: base.deletedAt
            ? {
                  deletedAt: base.deletedAt,
                  restoreDeadline: effectiveRestoreDeadline(gallery),
                  restoreExpired: isRestoreExpired(
                      effectiveRestoreDeadline(gallery)
                  ),
              }
            : null,
    }
}

export const formatAdminFlaggedFinal = (finalDoc, galleryDoc, ownerDoc) => {
    const final = finalDoc?.toObject?.() ?? finalDoc ?? {}
    const gallery = galleryDoc?.toObject?.() ?? galleryDoc ?? {}
    const owner = ownerDoc?.toObject?.() ?? ownerDoc ?? {}

    return {
        id: final._id ?? final.id,
        galleryId: String(final.gallery),
        galleryName: gallery.name ?? null,
        gallerySlug: gallery.slug ?? null,
        originalFilename: final.originalFilename,
        flaggedAt: final.flaggedAt ?? null,
        feedback: final.feedback ?? null,
        studio: {
            userId: owner._id ?? owner.id ?? gallery.owner ?? null,
            email: owner.email ?? null,
            companyName: owner.studio?.companyName?.trim?.() || "",
            companySlug: owner.studio?.companySlug?.trim?.() || "",
        },
        createdAt: final.createdAt,
        updatedAt: final.updatedAt,
    }
}
