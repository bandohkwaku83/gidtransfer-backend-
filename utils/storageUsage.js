import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import {
    galleryNotDeletedFilter,
    galleryOwnerFilter,
} from "./galleryFields.js"

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

/**
 * Plan storage = non-video proofs/selections/finals.
 * Video storage = isVideo media (separate plan cap).
 */
export const getOwnerStorageByGallery = async (ownerId, galleryIds = null) => {
    const ids = await resolveGalleryIds(ownerId, galleryIds)

    const [photoRawAgg, photoSelectionAgg, finalAgg, videoPhotoAgg, videoFinalAgg] =
        await Promise.all([
            ids.length
                ? GalleryPhoto.aggregate([
                      {
                          $match: {
                              gallery: { $in: ids },
                              deletedAt: null,
                              isVideo: { $ne: true },
                              selectedByClient: { $ne: true },
                          },
                      },
                      {
                          $group: {
                              _id: "$gallery",
                              bytes: { $sum: "$sizeBytes" },
                          },
                      },
                  ])
                : [],
            ids.length
                ? GalleryPhoto.aggregate([
                      {
                          $match: {
                              gallery: { $in: ids },
                              deletedAt: null,
                              isVideo: { $ne: true },
                              selectedByClient: true,
                          },
                      },
                      {
                          $group: {
                              _id: "$gallery",
                              bytes: { $sum: "$sizeBytes" },
                          },
                      },
                  ])
                : [],
            ids.length
                ? GalleryFinal.aggregate([
                      {
                          $match: {
                              gallery: { $in: ids },
                              deletedAt: null,
                              isVideo: { $ne: true },
                          },
                      },
                      {
                          $group: {
                              _id: "$gallery",
                              bytes: { $sum: "$sizeBytes" },
                          },
                      },
                  ])
                : [],
            ids.length
                ? GalleryPhoto.aggregate([
                      {
                          $match: {
                              gallery: { $in: ids },
                              deletedAt: null,
                              isVideo: true,
                          },
                      },
                      {
                          $group: {
                              _id: "$gallery",
                              bytes: { $sum: "$sizeBytes" },
                          },
                      },
                  ])
                : [],
            ids.length
                ? GalleryFinal.aggregate([
                      {
                          $match: {
                              gallery: { $in: ids },
                              deletedAt: null,
                              isVideo: true,
                          },
                      },
                      {
                          $group: {
                              _id: "$gallery",
                              bytes: { $sum: "$sizeBytes" },
                          },
                      },
                  ])
                : [],
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

    return { usageByGallery, breakdown, galleryIds: ids }
}

/** Totals only — plan pool + separate videoUsedBytes. */
export const getOwnerStorageBreakdown = async (ownerId, galleryIds = null) => {
    const { breakdown } = await getOwnerStorageByGallery(ownerId, galleryIds)
    return breakdown
}
