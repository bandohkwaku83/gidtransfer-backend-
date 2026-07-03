import mongoose from "mongoose"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"

/** Consistent list ordering for uploads and finals. */
export const GALLERY_MEDIA_SORT = { sortOrder: 1, createdAt: 1 }

export const parseReorderIdList = (body, camelKey, snakeKey) => {
    const raw = body?.[camelKey] ?? body?.[snakeKey]
    if (!Array.isArray(raw)) return null
    return raw.map((id) => String(id).trim()).filter(Boolean)
}

export const validateGalleryReorderIds = (orderedIds, activeDocs, label) => {
    if (!orderedIds?.length) {
        return `${label} array is required`
    }

    const invalid = orderedIds.filter((id) => !mongoose.isValidObjectId(id))
    if (invalid.length) {
        return `Invalid id in ${label}`
    }

    if (new Set(orderedIds).size !== orderedIds.length) {
        return `Duplicate ids in ${label}`
    }

    const activeIds = new Set(activeDocs.map((doc) => String(doc._id)))
    if (orderedIds.length !== activeIds.size) {
        return `Expected ${activeIds.size} ids in ${label}, received ${orderedIds.length}`
    }

    for (const id of orderedIds) {
        if (!activeIds.has(String(id))) {
            return `Unknown or inactive id in ${label}: ${id}`
        }
    }

    return null
}

export async function getNextGalleryMediaSortOrder(Model, galleryId) {
    const last = await Model.findOne({
        gallery: galleryId,
        deletedAt: null,
    })
        .sort({ sortOrder: -1, createdAt: -1 })
        .select("sortOrder")
        .lean()

    if (last && typeof last.sortOrder === "number") {
        return last.sortOrder + 1
    }
    return 0
}

export async function persistGalleryMediaReorder(Model, galleryId, orderedIds) {
    const ops = orderedIds.map((id, index) => ({
        updateOne: {
            filter: {
                _id: id,
                gallery: galleryId,
                deletedAt: null,
            },
            update: { $set: { sortOrder: index } },
        },
    }))
    if (!ops.length) return
    await Model.bulkWrite(ops, { ordered: true })
}

async function backfillModelSortOrders(Model, label) {
    const needsBackfill = await Model.exists({
        sortOrder: { $exists: false },
    })
    if (!needsBackfill) return 0

    const groups = await Model.aggregate([
        { $match: { deletedAt: null, sortOrder: { $exists: false } } },
        { $sort: { createdAt: 1 } },
        {
            $group: {
                _id: "$gallery",
                ids: { $push: "$_id" },
            },
        },
    ])

    let modified = 0
    for (const group of groups) {
        const existing = await Model.find({
            gallery: group._id,
            deletedAt: null,
            sortOrder: { $exists: true },
        })
            .sort({ sortOrder: -1 })
            .select("sortOrder")
            .lean()

        let next =
            existing.length && typeof existing[0].sortOrder === "number"
                ? existing[0].sortOrder + 1
                : 0

        const ops = group.ids.map((id) => {
            const sortOrder = next
            next += 1
            return {
                updateOne: {
                    filter: { _id: id },
                    update: { $set: { sortOrder } },
                },
            }
        })
        if (!ops.length) continue
        const result = await Model.bulkWrite(ops)
        modified += result.modifiedCount ?? 0
    }

    if (modified > 0) {
        console.log(
            `Gallery media migration: backfilled sortOrder on ${modified} ${label}`
        )
    }
    return modified
}

export async function backfillGalleryMediaSortOrders() {
    const photos = await backfillModelSortOrders(GalleryPhoto, "photo(s)")
    const finals = await backfillModelSortOrders(GalleryFinal, "final(s)")
    return { photos, finals }
}
