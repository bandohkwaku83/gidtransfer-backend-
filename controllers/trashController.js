import mongoose from "mongoose"
import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import {
    formatGalleryResponse,
    galleryNotDeletedFilter,
    galleryOwnerFilter,
    galleryTrashedOnlyFilter,
    invalidateGalleryCounts,
} from "../utils/galleryFields.js"
import {
    formatGalleryFinalResponse,
    formatGalleryPhotoResponse,
} from "../utils/galleryDetailHelpers.js"
import {
    effectiveRestoreDeadline,
    emptyTrashForOwner,
    GALLERY_TRASH_RETENTION_DAYS,
    isRestoreExpired,
    permanentlyDeleteGallery,
    permanentlyDeleteGalleryFinal,
    permanentlyDeleteGalleryPhoto,
} from "../utils/galleryTrash.js"
import { GALLERY_CLIENT_POPULATE } from "../utils/clientFields.js"

const populateGalleryBasic = GALLERY_CLIENT_POPULATE

const formatTrashedGallery = (doc) => {
    const base = formatGalleryResponse(doc)
    return {
        ...base,
        restoreDeadline: effectiveRestoreDeadline(doc),
        restoreExpired: isRestoreExpired(effectiveRestoreDeadline(doc)),
    }
}

const formatTrashedFile = (doc, { type, galleryName }) => {
    const formatter =
        type === "final" ? formatGalleryFinalResponse : formatGalleryPhotoResponse
    const base = formatter(doc)
    return {
        ...base,
        type,
        galleryName,
        restoreDeadline: effectiveRestoreDeadline(doc),
        restoreExpired: isRestoreExpired(effectiveRestoreDeadline(doc)),
    }
}

async function loadGalleryNameMap(ownerId, galleryIds) {
    if (!galleryIds.length) return new Map()
    const rows = await Gallery.find({
        _id: { $in: galleryIds },
        ...galleryOwnerFilter(ownerId),
    })
        .select("name")
        .exec()
    return new Map(rows.map((g) => [String(g._id), g.name]))
}

export const listTrash = async (req, res) => {
    try {
        const ownerId = req.user._id
        const ownerPart = galleryOwnerFilter(ownerId)
        const trashed = galleryTrashedOnlyFilter()

        const [galleryRows, activeGalleryIds] = await Promise.all([
            Gallery.find({ ...ownerPart, ...trashed })
                .populate(populateGalleryBasic)
                .sort({ deletedAt: -1 })
                .exec(),
            Gallery.find({ ...ownerPart, ...galleryNotDeletedFilter() })
                .distinct("_id")
                .exec(),
        ])

        const activeIds =
            activeGalleryIds.length > 0 ? activeGalleryIds : [new mongoose.Types.ObjectId()]

        const [photoRows, finalRows] = await Promise.all([
            GalleryPhoto.find({
                ...ownerPart,
                ...trashed,
                gallery: { $in: activeIds },
            })
                .sort({ deletedAt: -1 })
                .exec(),
            GalleryFinal.find({
                ...ownerPart,
                ...trashed,
                gallery: { $in: activeIds },
            })
                .sort({ deletedAt: -1 })
                .exec(),
        ])

        const galleryIdSet = new Set([
            ...photoRows.map((p) => String(p.gallery)),
            ...finalRows.map((f) => String(f.gallery)),
        ])
        const galleryNames = await loadGalleryNameMap(
            ownerId,
            [...galleryIdSet].filter((id) => mongoose.isValidObjectId(id))
        )

        const galleries = galleryRows.map(formatTrashedGallery)
        const photos = [
            ...photoRows.map((row) =>
                formatTrashedFile(row, {
                    type: "original",
                    galleryName: galleryNames.get(String(row.gallery)) ?? null,
                })
            ),
            ...finalRows.map((row) =>
                formatTrashedFile(row, {
                    type: "final",
                    galleryName: galleryNames.get(String(row.gallery)) ?? null,
                })
            ),
        ].sort(
            (a, b) =>
                new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
        )

        return res.status(200).json({
            retentionDays: GALLERY_TRASH_RETENTION_DAYS,
            counts: {
                galleries: galleries.length,
                photos: photos.length,
            },
            galleries,
            photos,
        })
    } catch (error) {
        console.error("listTrash:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

const parseIdList = (value) =>
    Array.isArray(value)
        ? value.filter((id) => mongoose.isValidObjectId(id)).map(String)
        : []

async function loadTrashedPhotosByIds(ownerPart, trashed, photoIds) {
    if (!photoIds.length) {
        return { originals: [], finals: [] }
    }

    const [originals, finals] = await Promise.all([
        GalleryPhoto.find({
            ...ownerPart,
            ...trashed,
            _id: { $in: photoIds },
        }).exec(),
        GalleryFinal.find({
            ...ownerPart,
            ...trashed,
            _id: { $in: photoIds },
        }).exec(),
    ])

    return { originals, finals }
}

const restoreTrashedPhotoRows = async (rows) => {
    let restored = 0
    let expired = 0

    for (const row of rows) {
        const deadline = effectiveRestoreDeadline(row)
        if (isRestoreExpired(deadline)) {
            expired += 1
            continue
        }
        row.deletedAt = null
        row.restoreDeadline = null
        await row.save()
        restored += 1
    }

    return { restored, expired }
}

export const restoreTrashItems = async (req, res) => {
    try {
        const ownerId = req.user._id
        const ownerPart = galleryOwnerFilter(ownerId)
        const trashed = galleryTrashedOnlyFilter()

        const galleryIds = parseIdList(req.body?.galleryIds ?? req.body?.gallery_ids)
        const photoIds = parseIdList(req.body?.photoIds ?? req.body?.photo_ids)

        if (!galleryIds.length && !photoIds.length) {
            return res.status(400).json({
                message: "Provide galleryIds and/or photoIds",
            })
        }

        const restored = { galleries: 0, photos: 0 }
        const expired = { galleries: 0, photos: 0 }

        if (galleryIds.length) {
            const rows = await Gallery.find({
                ...ownerPart,
                ...trashed,
                _id: { $in: galleryIds },
            }).exec()

            for (const gallery of rows) {
                const deadline = effectiveRestoreDeadline(gallery)
                if (isRestoreExpired(deadline)) {
                    expired.galleries += 1
                    continue
                }
                gallery.deletedAt = null
                gallery.restoreDeadline = null
                await gallery.save()
                restored.galleries += 1
            }
        }

        if (photoIds.length) {
            const { originals, finals } = await loadTrashedPhotosByIds(
                ownerPart,
                trashed,
                photoIds
            )
            const originalResult = await restoreTrashedPhotoRows(originals)
            const finalResult = await restoreTrashedPhotoRows(finals)
            restored.photos += originalResult.restored + finalResult.restored
            expired.photos += originalResult.expired + finalResult.expired
        }

        const totalExpired = expired.galleries + expired.photos
        const totalRestored = restored.galleries + restored.photos

        if (totalRestored === 0 && totalExpired > 0) {
            return res.status(410).json({
                message: "Restore deadline has passed for selected items",
                restored,
                expired,
            })
        }

        return res.status(200).json({
            message: "Trash items restored",
            restored,
            expired: totalExpired > 0 ? expired : undefined,
        })
    } catch (error) {
        console.error("restoreTrashItems:", error)
        return res.status(500).json({ message: "Server error" })
    } finally {
        invalidateGalleryCounts(req.user._id)
    }
}

export const emptyTrash = async (req, res) => {
    try {
        const ownerId = req.user._id
        const ownerPart = galleryOwnerFilter(ownerId)
        const trashed = galleryTrashedOnlyFilter()

        const galleryIds = parseIdList(req.body?.galleryIds ?? req.body?.gallery_ids)
        const photoIds = parseIdList(req.body?.photoIds ?? req.body?.photo_ids)
        const selective = galleryIds.length > 0 || photoIds.length > 0

        if (!selective) {
            const result = await emptyTrashForOwner(ownerId)
            return res.status(200).json({
                message: "Trash emptied",
                deleted: {
                    galleries: result.galleries,
                    photos: result.photos + result.finals,
                },
            })
        }

        const deleted = { galleries: 0, photos: 0 }

        if (galleryIds.length) {
            const rows = await Gallery.find({
                ...ownerPart,
                ...trashed,
                _id: { $in: galleryIds },
            }).exec()
            for (const gallery of rows) {
                await permanentlyDeleteGallery(gallery)
                deleted.galleries += 1
            }
        }

        if (photoIds.length) {
            const { originals, finals } = await loadTrashedPhotosByIds(
                ownerPart,
                trashed,
                photoIds
            )
            for (const photo of originals) {
                await permanentlyDeleteGalleryPhoto(photo)
                deleted.photos += 1
            }
            for (const final of finals) {
                await permanentlyDeleteGalleryFinal(final)
                deleted.photos += 1
            }
        }

        return res.status(200).json({
            message: "Selected trash items permanently deleted",
            deleted,
        })
    } catch (error) {
        console.error("emptyTrash:", error)
        return res.status(500).json({ message: "Server error" })
    } finally {
        invalidateGalleryCounts(req.user._id)
    }
}
