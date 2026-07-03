import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import {
    galleryNotDeletedFilter,
    galleryOwnerFilter,
} from "../utils/galleryFields.js"
import {
    computePercentOfPlan,
    getPlanSummary,
    parseStorageSort,
    sortStorageGalleries,
    sumBreakdown,
} from "../utils/storageFields.js"

const emptyGalleryUsage = () => ({
    rawsBytes: 0,
    selectionsBytes: 0,
    finalsBytes: 0,
    totalBytes: 0,
})

export const getStorage = async (req, res) => {
    try {
        const ownerId = req.user._id
        const sort = parseStorageSort(req.query)

        const galleries = await Gallery.find({
            ...galleryOwnerFilter(ownerId),
            ...galleryNotDeletedFilter(),
        })
            .populate("client", "name")
            .select("name client")
            .lean()

        const galleryIds = galleries.map((g) => g._id)

        const [photoRawAgg, photoSelectionAgg, finalAgg] = await Promise.all([
            galleryIds.length
                ? GalleryPhoto.aggregate([
                      {
                          $match: {
                              gallery: { $in: galleryIds },
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
            galleryIds.length
                ? GalleryPhoto.aggregate([
                      {
                          $match: {
                              gallery: { $in: galleryIds },
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
            galleryIds.length
                ? GalleryFinal.aggregate([
                      {
                          $match: {
                              gallery: { $in: galleryIds },
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
            const usage =
                usageByGallery.get(galleryId) ?? emptyGalleryUsage()

            usage.rawsBytes += row.bytes
            usage.totalBytes =
                usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes

            usageByGallery.set(galleryId, usage)
        }

        for (const row of photoSelectionAgg) {
            const galleryId = String(row._id)
            const usage =
                usageByGallery.get(galleryId) ?? emptyGalleryUsage()

            usage.selectionsBytes += row.bytes
            usage.totalBytes =
                usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes

            usageByGallery.set(galleryId, usage)
        }

        for (const row of finalAgg) {
            const galleryId = String(row._id)
            const usage =
                usageByGallery.get(galleryId) ?? emptyGalleryUsage()

            usage.finalsBytes += row.bytes
            usage.totalBytes = usage.rawsBytes + usage.selectionsBytes + usage.finalsBytes

            usageByGallery.set(galleryId, usage)
        }

        const galleryRows = galleries.map((gallery) => {
            const galleryId = String(gallery._id)
            const usage = usageByGallery.get(galleryId) ?? emptyGalleryUsage()

            return {
                id: galleryId,
                name: gallery.name ?? "",
                clientId: gallery.client?._id
                    ? String(gallery.client._id)
                    : null,
                clientName: gallery.client?.name ?? "",
                ...usage,
            }
        })

        const sortedGalleries = sortStorageGalleries(galleryRows, sort)
        const breakdown = sumBreakdown(sortedGalleries)
        const plan = getPlanSummary(req.user)
        const limitBytes = plan.storageLimitBytes

        return res.status(200).json({
            summary: {
                usedBytes: breakdown.totalBytes,
                limitBytes,
                planName: plan.planName,
                planId: plan.planId,
                percentOfPlan: computePercentOfPlan(
                    breakdown.totalBytes,
                    limitBytes
                ),
                breakdown: {
                    rawsBytes: breakdown.rawsBytes,
                    selectionsBytes: breakdown.selectionsBytes,
                    finalsBytes: breakdown.finalsBytes,
                },
            },
            galleries: sortedGalleries,
            sort,
        })
    } catch (error) {
        console.error("Storage error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
