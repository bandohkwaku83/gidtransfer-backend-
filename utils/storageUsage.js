import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import CollaborationAsset from "../models/CollaborationAsset.js"
import mongoose from "mongoose"
import {
    galleryNotDeletedFilter,
    galleryOwnerFilter,
} from "./galleryFields.js"
import { cacheDelete, cacheGetOrSet } from "./memoryCache.js"

const STORAGE_CACHE_TTL_MS = Math.max(
    0,
    Number(process.env.STORAGE_CACHE_TTL_MS ?? 15_000)
)

const emptyGalleryUsage = () => ({
    rawsBytes: 0,
    selectionsBytes: 0,
    finalsBytes: 0,
    videoBytes: 0,
    totalBytes: 0,
})

const emptyBreakdown = () => ({
    rawsBytes: 0,
    selectionsBytes: 0,
    finalsBytes: 0,
    collaborationBytes: 0,
    totalBytes: 0,
    videoUsedBytes: 0,
})

const resolveGalleryIds = async (ownerId, galleryIds) => {
    if (galleryIds) return galleryIds
    const rows = await Gallery.find({
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
    })
        .select("_id")
        .lean()
    return rows.map((g) => g._id)
}

const recomputeGalleryTotal = (usage) => {
    usage.totalBytes =
        usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes
    return usage
}

const buildPhotoAggregate = (ids, extraMatch) =>
    GalleryPhoto.aggregate([
        {
            $match: {
                gallery: { $in: ids },
                deletedAt: null,
                ...extraMatch,
            },
        },
        {
            $group: {
                _id: "$gallery",
                bytes: { $sum: "$sizeBytes" },
            },
        },
    ])

const buildFinalAggregate = (ids, extraMatch) =>
    GalleryFinal.aggregate([
        {
            $match: {
                gallery: { $in: ids },
                deletedAt: null,
                ...extraMatch,
            },
        },
        {
            $group: {
                _id: "$gallery",
                bytes: { $sum: "$sizeBytes" },
            },
        },
    ])

const buildCollaborationAggregate = (ownerId, isVideo) => {
    if (!ownerId || !mongoose.isValidObjectId(ownerId)) return []
    return CollaborationAsset.aggregate([
        {
            $match: {
                owner: new mongoose.Types.ObjectId(String(ownerId)),
                deletedAt: null,
                isVideo: isVideo ? true : { $ne: true },
            },
        },
        {
            $group: {
                _id: null,
                bytes: { $sum: "$sizeBytes" },
            },
        },
    ])
}

const cloneUsageByGallery = (source) => {
    const clone = new Map()
    for (const [key, value] of source) {
        clone.set(key, { ...value })
    }
    return clone
}

const cloneBreakdown = (source) => ({ ...source })

const cloneComputationResult = (result) => ({
    usageByGallery: cloneUsageByGallery(result.usageByGallery),
    breakdown: cloneBreakdown(result.breakdown),
    galleryIds: [...result.galleryIds],
})

const computeOwnerStorage = async (ownerId, galleryIds) => {
    const ids = await resolveGalleryIds(ownerId, galleryIds)
    const hasIds = ids.length > 0

    const [
        photoRawAgg,
        photoSelectionAgg,
        finalAgg,
        videoPhotoAgg,
        videoFinalAgg,
        collabAgg,
        collabVideoAgg,
    ] = await Promise.all([
        hasIds
            ? buildPhotoAggregate(ids, {
                  isVideo: { $ne: true },
                  selectedByClient: { $ne: true },
              })
            : [],
        hasIds
            ? buildPhotoAggregate(ids, {
                  isVideo: { $ne: true },
                  selectedByClient: true,
              })
            : [],
        hasIds ? buildFinalAggregate(ids, { isVideo: { $ne: true } }) : [],
        hasIds ? buildPhotoAggregate(ids, { isVideo: true }) : [],
        hasIds ? buildFinalAggregate(ids, { isVideo: true }) : [],
        buildCollaborationAggregate(ownerId, false),
        buildCollaborationAggregate(ownerId, true),
    ])

    const usageByGallery = new Map()

    const bump = (row, field) => {
        const galleryId = String(row._id)
        const usage = usageByGallery.get(galleryId) ?? emptyGalleryUsage()
        usage[field] += Number(row.bytes) || 0
        usageByGallery.set(galleryId, recomputeGalleryTotal(usage))
    }

    for (const row of photoRawAgg) bump(row, "rawsBytes")
    for (const row of photoSelectionAgg) bump(row, "selectionsBytes")
    for (const row of finalAgg) bump(row, "finalsBytes")
    for (const row of videoPhotoAgg) bump(row, "videoBytes")
    for (const row of videoFinalAgg) bump(row, "videoBytes")

    const breakdown = emptyBreakdown()
    for (const usage of usageByGallery.values()) {
        breakdown.rawsBytes += usage.rawsBytes
        breakdown.selectionsBytes += usage.selectionsBytes
        breakdown.finalsBytes += usage.finalsBytes
        breakdown.totalBytes += usage.totalBytes
        breakdown.videoUsedBytes += usage.videoBytes
    }

    const collabBytes = Number(collabAgg[0]?.bytes) || 0
    const collabVideoBytes = Number(collabVideoAgg[0]?.bytes) || 0
    breakdown.collaborationBytes = collabBytes
    breakdown.totalBytes += collabBytes
    breakdown.videoUsedBytes += collabVideoBytes

    return { usageByGallery, breakdown, galleryIds: ids }
}

const ownerCacheKey = (ownerId) => `storage:owner:${String(ownerId)}`

/**
 * Plan storage = non-video proofs/selections/finals.
 * Video storage = isVideo media (separate plan cap).
 *
 * When `galleryIds` is omitted, the aggregate is cached per-owner for a short
 * TTL to smooth out the many callers (settings/dashboard/storage/plan checks).
 */
export const getOwnerStorageByGallery = async (ownerId, galleryIds = null) => {
    if (galleryIds || STORAGE_CACHE_TTL_MS <= 0) {
        return computeOwnerStorage(ownerId, galleryIds)
    }
    const cached = await cacheGetOrSet(
        ownerCacheKey(ownerId),
        () => computeOwnerStorage(ownerId, null),
        STORAGE_CACHE_TTL_MS
    )
    return cloneComputationResult(cached)
}

/** Totals only — plan pool + separate videoUsedBytes. */
export const getOwnerStorageBreakdown = async (ownerId, galleryIds = null) => {
    const { breakdown } = await getOwnerStorageByGallery(ownerId, galleryIds)
    return breakdown
}

/** Clear the cached storage aggregate after uploads/deletes. */
export const invalidateOwnerStorageCache = (ownerId) => {
    if (!ownerId) return
    cacheDelete(ownerCacheKey(ownerId))
}
