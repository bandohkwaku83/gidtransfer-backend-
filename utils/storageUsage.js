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
    totalBytes: 0,
})

export const getOwnerStorageBreakdown = async (ownerId, galleryIds = null) => {
    const ids =
        galleryIds ??
        (
            await Gallery.find({
                ...galleryOwnerFilter(ownerId),
                ...galleryNotDeletedFilter(),
            })
                .select("_id")
                .lean()
        ).map((g) => g._id)

    const [photoRawAgg, photoSelectionAgg, finalAgg] = await Promise.all([
        ids.length
            ? GalleryPhoto.aggregate([
                  {
                      $match: {
                          gallery: { $in: ids },
                          deletedAt: null,
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

    for (const row of photoRawAgg) {
        const galleryId = String(row._id)
        const usage = usageByGallery.get(galleryId) ?? emptyGalleryUsage()

        usage.rawsBytes += row.bytes
        usage.totalBytes =
            usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes

        usageByGallery.set(galleryId, usage)
    }

    for (const row of photoSelectionAgg) {
        const galleryId = String(row._id)
        const usage = usageByGallery.get(galleryId) ?? emptyGalleryUsage()

        usage.selectionsBytes += row.bytes
        usage.totalBytes =
            usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes

        usageByGallery.set(galleryId, usage)
    }

    for (const row of finalAgg) {
        const galleryId = String(row._id)
        const usage = usageByGallery.get(galleryId) ?? emptyGalleryUsage()

        usage.finalsBytes += row.bytes
        usage.totalBytes =
            usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes

        usageByGallery.set(galleryId, usage)
    }

    const rows = [...usageByGallery.values()]
    const breakdown = rows.reduce(
        (acc, row) => {
            acc.rawsBytes += row.rawsBytes
            acc.selectionsBytes += row.selectionsBytes
            acc.finalsBytes += row.finalsBytes
            acc.totalBytes += row.totalBytes
            return acc
        },
        {
            rawsBytes: 0,
            selectionsBytes: 0,
            finalsBytes: 0,
            totalBytes: 0,
        }
    )

    return breakdown
}
