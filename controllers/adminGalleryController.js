import mongoose from "mongoose"
import Gallery from "../models/Gallery.js"
import GalleryFinal from "../models/GalleryFinal.js"
import User from "../models/User.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import {
    attachGalleryCounts,
    galleryNotDeletedFilter,
    galleryTrashedOnlyFilter,
    invalidateGalleryCounts,
    parseShareLinkExpiryDays,
} from "../utils/galleryFields.js"
import { clearShareCoverSnapshot } from "../utils/galleryShareCover.js"
import {
    effectiveRestoreDeadline,
    emptyTrashForOwner,
    GALLERY_TRASH_RETENTION_DAYS,
    isRestoreExpired,
    permanentlyDeleteGallery,
    purgeExpiredTrash,
} from "../utils/galleryTrash.js"
import { GALLERY_CLIENT_POPULATE } from "../utils/clientFields.js"
import {
    buildAdminGalleryListFilter,
    formatAdminFlaggedFinal,
    formatAdminGalleryDetail,
    formatAdminGalleryListRow,
} from "../utils/adminGalleryFields.js"
import { logAdminAction, requireAuditReason } from "../utils/adminAudit.js"
import { scheduleStudioGalleryIndex } from "../utils/opensearchStudio.js"

const populateGallery = [
    GALLERY_CLIENT_POPULATE,
    {
        path: "owner",
        select: "email studio.isActive studio.companyName studio.companySlug",
    },
]

const computeShareExpiresAt = (galleryShareDays) => {
    if (galleryShareDays === null || galleryShareDays === undefined) return null
    const n = Number(galleryShareDays)
    if (!Number.isFinite(n) || n < 1) return null
    return new Date(Date.now() + n * 86_400_000)
}

const findAdminGallery = async (galleryId, { includeDeleted = true } = {}) => {
    if (!mongoose.isValidObjectId(galleryId)) {
        return { error: { status: 400, message: "Invalid gallery id" } }
    }

    const filter = { _id: galleryId }
    if (!includeDeleted) {
        Object.assign(filter, galleryNotDeletedFilter())
    }

    const gallery = await Gallery.findOne(filter).populate(populateGallery)
    if (!gallery) {
        return { error: { status: 404, message: "Gallery not found" } }
    }

    return { gallery }
}

export const listAdminGalleries = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const { filter, errors } = await buildAdminGalleryListFilter(req.query)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const [total, rows] = await Promise.all([
            Gallery.countDocuments(filter),
            paginatedQuery(
                Gallery.find(filter)
                    .populate(populateGallery)
                    .sort({ updatedAt: -1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            items: rows.map((row) => formatAdminGalleryListRow(row, row.owner)),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listAdminGalleries:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getAdminGallery = async (req, res) => {
    try {
        const { gallery, error } = await findAdminGallery(req.params.galleryId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const ownerId = gallery.owner?._id ?? gallery.owner
        const galleryCounts = ownerId
            ? await attachGalleryCounts(ownerId)
            : null

        return res.status(200).json({
            gallery: formatAdminGalleryDetail({
                gallery,
                owner: gallery.owner,
                galleryCounts,
            }),
        })
    } catch (error) {
        console.error("getAdminGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listPhotographerGalleriesAdmin = async (req, res) => {
    try {
        const { userId } = req.params
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ message: "Invalid user id" })
        }

        const user = await User.findById(userId).select(
            "email studio.companyName studio.companySlug isActive"
        )
        if (!user) {
            return res.status(404).json({ message: "Photographer not found" })
        }

        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const trashOnly =
            String(req.query.trashOnly ?? "").trim().toLowerCase() === "true"
        const filter = {
            owner: user._id,
            ...(trashOnly
                ? galleryTrashedOnlyFilter()
                : galleryNotDeletedFilter()),
        }

        const status = String(req.query.status ?? "").trim().toLowerCase()
        if (status && status !== "all") {
            filter.status = status
        }

        const [total, rows, galleryCounts] = await Promise.all([
            Gallery.countDocuments(filter),
            paginatedQuery(
                Gallery.find(filter)
                    .populate(GALLERY_CLIENT_POPULATE)
                    .sort({ updatedAt: -1 }),
                pagination
            ).exec(),
            attachGalleryCounts(user._id),
        ])

        return res.status(200).json({
            photographer: {
                userId: user._id,
                email: user.email,
                companyName: user.studio?.companyName?.trim() || "",
                companySlug: user.studio?.companySlug?.trim() || "",
                isActive: user.isActive !== false,
            },
            counts: galleryCounts,
            items: rows.map((row) => formatAdminGalleryListRow(row, user)),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listPhotographerGalleriesAdmin:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const revokeAdminGalleryShare = async (req, res) => {
    try {
        const { gallery, error } = await findAdminGallery(req.params.galleryId, {
            includeDeleted: false,
        })
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const { error: reasonError, reason } = requireAuditReason(
            req.body?.reason ?? "Admin share revoke"
        )
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        clearShareCoverSnapshot(gallery)
        await Gallery.findByIdAndUpdate(gallery._id, {
            $unset: { shareToken: 1 },
            $set: {
                shareExpiresAt: null,
                shareUseDefaultCover: null,
                shareCoverImageUrl: null,
                shareCoverFocalX: null,
                shareCoverFocalY: null,
                shareCoverTextColor: null,
                shareCoverButtonColor: null,
            },
        })

        await logAdminAction({
            admin: req.admin,
            action: "gallery.share.revoke",
            reason,
            resourceType: "gallery",
            resourceId: String(gallery._id),
        })

        const refreshed = await Gallery.findById(gallery._id).populate(
            populateGallery
        )
        return res.status(200).json({
            message: "Share link revoked",
            gallery: formatAdminGalleryDetail({
                gallery: refreshed,
                owner: refreshed.owner,
            }),
        })
    } catch (error) {
        console.error("revokeAdminGalleryShare:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const extendAdminGalleryShare = async (req, res) => {
    try {
        const { gallery, error } = await findAdminGallery(req.params.galleryId, {
            includeDeleted: false,
        })
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        if (!gallery.shareToken) {
            return res.status(400).json({
                message: "Gallery has no active share link to extend",
            })
        }

        const { error: reasonError, reason } = requireAuditReason(
            req.body?.reason ?? "Admin share extend"
        )
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const daysRaw =
            req.body?.days ??
            req.body?.shareLinkExpiryDays ??
            req.body?.share_link_expiry_days
        let nextExpiry = null

        if (daysRaw === null) {
            gallery.shareLinkExpiryDays = null
            gallery.shareExpiresAt = null
        } else if (daysRaw !== undefined) {
            const parsed = parseShareLinkExpiryDays(daysRaw)
            if (parsed.error) {
                return res.status(400).json({ message: parsed.error })
            }
            gallery.shareLinkExpiryDays = parsed.days
            nextExpiry = computeShareExpiresAt(parsed.days)
            gallery.shareExpiresAt = nextExpiry
        } else {
            const extendBy = Number(req.body?.extendDays ?? 30)
            if (!Number.isInteger(extendBy) || extendBy < 1) {
                return res.status(400).json({
                    message: "extendDays must be a positive integer",
                })
            }
            const base =
                gallery.shareExpiresAt &&
                gallery.shareExpiresAt.getTime() > Date.now()
                    ? gallery.shareExpiresAt.getTime()
                    : Date.now()
            gallery.shareExpiresAt = new Date(base + extendBy * 86_400_000)
            if (gallery.shareLinkExpiryDays != null) {
                gallery.shareLinkExpiryDays = Math.max(
                    gallery.shareLinkExpiryDays,
                    extendBy
                )
            }
        }

        await gallery.save()
        await logAdminAction({
            admin: req.admin,
            action: "gallery.share.extend",
            reason,
            resourceType: "gallery",
            resourceId: String(gallery._id),
            meta: {
                shareExpiresAt: gallery.shareExpiresAt,
                shareLinkExpiryDays: gallery.shareLinkExpiryDays,
            },
        })

        const refreshed = await Gallery.findById(gallery._id).populate(
            populateGallery
        )
        return res.status(200).json({
            message: "Share link extended",
            gallery: formatAdminGalleryDetail({
                gallery: refreshed,
                owner: refreshed.owner,
            }),
        })
    } catch (error) {
        console.error("extendAdminGalleryShare:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const patchAdminGalleryShare = async (req, res) => {
    try {
        const { gallery, error } = await findAdminGallery(req.params.galleryId, {
            includeDeleted: false,
        })
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const { error: reasonError, reason } = requireAuditReason(
            req.body?.reason ?? "Admin share update"
        )
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const downloadsRaw =
            req.body?.allowDownloads ?? req.body?.allow_downloads
        const lockRaw =
            req.body?.selectionLocked ?? req.body?.selection_locked
        let changed = false

        if (downloadsRaw !== undefined) {
            gallery.allowDownloads =
                downloadsRaw === true ||
                downloadsRaw === "true" ||
                downloadsRaw === 1 ||
                downloadsRaw === "1"
            changed = true
        }

        if (lockRaw !== undefined) {
            gallery.selectionLocked =
                lockRaw === true ||
                lockRaw === "true" ||
                lockRaw === 1 ||
                lockRaw === "1"
            changed = true
        }

        if (!changed) {
            return res.status(400).json({
                message:
                    "Provide allowDownloads and/or selectionLocked to update",
            })
        }

        await gallery.save()
        await logAdminAction({
            admin: req.admin,
            action: "gallery.share.patch",
            reason,
            resourceType: "gallery",
            resourceId: String(gallery._id),
            meta: {
                allowDownloads: gallery.allowDownloads,
                selectionLocked: gallery.selectionLocked,
            },
        })

        const refreshed = await Gallery.findById(gallery._id).populate(
            populateGallery
        )
        return res.status(200).json({
            message: "Gallery share settings updated",
            gallery: formatAdminGalleryDetail({
                gallery: refreshed,
                owner: refreshed.owner,
            }),
        })
    } catch (error) {
        console.error("patchAdminGalleryShare:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listModerationFlaggedFinals = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })

        const filter = { flaggedByClient: true }
        const ownerId = String(req.query.ownerId ?? req.query.userId ?? "").trim()
        if (ownerId) {
            if (!mongoose.isValidObjectId(ownerId)) {
                return res.status(400).json({ message: "Invalid ownerId" })
            }
            filter.owner = ownerId
        }

        const [total, rows] = await Promise.all([
            GalleryFinal.countDocuments(filter),
            paginatedQuery(
                GalleryFinal.find(filter).sort({ flaggedAt: -1, updatedAt: -1 }),
                pagination
            ).exec(),
        ])

        const galleryIds = [
            ...new Set(rows.map((row) => String(row.gallery))),
        ].filter(Boolean)
        const galleries = galleryIds.length
            ? await Gallery.find({ _id: { $in: galleryIds } })
                  .select("name slug owner")
                  .lean()
                  .exec()
            : []
        const galleryMap = new Map(
            galleries.map((g) => [String(g._id), g])
        )
        const ownerIds = [
            ...new Set(galleries.map((g) => String(g.owner))),
        ]
        const owners = ownerIds.length
            ? await User.find({ _id: { $in: ownerIds } })
                  .select("email studio.companyName studio.companySlug")
                  .lean()
                  .exec()
            : []
        const ownerMap = new Map(owners.map((u) => [String(u._id), u]))

        return res.status(200).json({
            items: rows.map((row) => {
                const gallery = galleryMap.get(String(row.gallery))
                const owner = gallery
                    ? ownerMap.get(String(gallery.owner))
                    : null
                return formatAdminFlaggedFinal(row, gallery, owner)
            }),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listModerationFlaggedFinals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listAdminTrash = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = { ...galleryTrashedOnlyFilter() }
        const ownerId = String(req.query.ownerId ?? req.query.userId ?? "").trim()
        if (ownerId) {
            if (!mongoose.isValidObjectId(ownerId)) {
                return res.status(400).json({ message: "Invalid ownerId" })
            }
            filter.owner = ownerId
        }

        const [total, rows] = await Promise.all([
            Gallery.countDocuments(filter),
            paginatedQuery(
                Gallery.find(filter)
                    .populate(populateGallery)
                    .sort({ deletedAt: -1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            retentionDays: GALLERY_TRASH_RETENTION_DAYS,
            items: rows.map((row) => {
                const base = formatAdminGalleryListRow(row, row.owner)
                return {
                    ...base,
                    restoreDeadline: effectiveRestoreDeadline(row),
                    restoreExpired: isRestoreExpired(
                        effectiveRestoreDeadline(row)
                    ),
                }
            }),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listAdminTrash:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const purgeAdminExpiredTrash = async (req, res) => {
    try {
        const { error: reasonError, reason } = requireAuditReason(
            req.body?.reason ?? "Purge expired platform trash"
        )
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const ownerId = String(req.body?.ownerId ?? req.query?.ownerId ?? "").trim()
        if (ownerId && !mongoose.isValidObjectId(ownerId)) {
            return res.status(400).json({ message: "Invalid ownerId" })
        }

        const result = await purgeExpiredTrash({
            ownerId: ownerId || undefined,
        })

        await logAdminAction({
            admin: req.admin,
            action: "trash.purge_expired",
            reason,
            resourceType: "trash",
            resourceId: ownerId || "platform",
            meta: result,
        })

        return res.status(200).json({
            message: "Expired trash purged",
            result,
        })
    } catch (error) {
        console.error("purgeAdminExpiredTrash:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const purgeAdminGallery = async (req, res) => {
    try {
        const { gallery, error } = await findAdminGallery(req.params.galleryId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const { error: reasonError, reason } = requireAuditReason(req.body?.reason)
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const ownerId = gallery.owner?._id ?? gallery.owner
        const galleryId = String(gallery._id)
        await permanentlyDeleteGallery(gallery)
        if (ownerId) invalidateGalleryCounts(ownerId)

        await logAdminAction({
            admin: req.admin,
            action: "gallery.purge",
            reason,
            resourceType: "gallery",
            resourceId: galleryId,
            meta: { ownerId: String(ownerId ?? "") },
        })

        return res.status(200).json({
            message: "Gallery permanently deleted",
            galleryId,
        })
    } catch (error) {
        console.error("purgeAdminGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const restoreAdminGallery = async (req, res) => {
    try {
        const { gallery, error } = await findAdminGallery(req.params.galleryId)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        if (!gallery.deletedAt) {
            return res.status(400).json({ message: "Gallery is not in trash" })
        }

        if (isRestoreExpired(effectiveRestoreDeadline(gallery))) {
            return res.status(410).json({ message: "Restore deadline has passed" })
        }

        const { error: reasonError, reason } = requireAuditReason(
            req.body?.reason ?? "Admin gallery restore"
        )
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        gallery.deletedAt = null
        gallery.restoreDeadline = null
        await gallery.save()

        const ownerId = gallery.owner?._id ?? gallery.owner
        if (ownerId) {
            invalidateGalleryCounts(ownerId)
            scheduleStudioGalleryIndex(gallery)
        }

        await logAdminAction({
            admin: req.admin,
            action: "gallery.restore",
            reason,
            resourceType: "gallery",
            resourceId: String(gallery._id),
        })

        const refreshed = await Gallery.findById(gallery._id).populate(
            populateGallery
        )
        return res.status(200).json({
            message: "Gallery restored",
            gallery: formatAdminGalleryDetail({
                gallery: refreshed,
                owner: refreshed.owner,
            }),
        })
    } catch (error) {
        console.error("restoreAdminGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const emptyAdminStudioTrash = async (req, res) => {
    try {
        const { userId } = req.params
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ message: "Invalid user id" })
        }

        const { error: reasonError, reason } = requireAuditReason(req.body?.reason)
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const user = await User.findById(userId).select("_id email")
        if (!user) {
            return res.status(404).json({ message: "Photographer not found" })
        }

        const result = await emptyTrashForOwner(user._id)
        invalidateGalleryCounts(user._id)

        await logAdminAction({
            admin: req.admin,
            action: "trash.empty_studio",
            reason,
            resourceType: "user",
            resourceId: String(user._id),
            meta: result,
        })

        return res.status(200).json({
            message: "Studio trash emptied",
            result,
        })
    } catch (error) {
        console.error("emptyAdminStudioTrash:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
