import Gallery from "../models/Gallery.js"
import {
    galleryNotDeletedFilter,
    galleryOwnerFilter,
} from "../utils/galleryFields.js"
import {
    computePercentOfPlan,
    getPlanSummary,
    parseStorageSort,
    sortStorageGalleries,
} from "../utils/storageFields.js"
import { getOwnerStorageByGallery } from "../utils/storageUsage.js"
import { getUserEntitlements } from "../utils/planFeatures.js"
import { getEffectiveVideoUploadLimitBytes } from "../utils/planCatalog.js"

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
        const { usageByGallery, breakdown } = await getOwnerStorageByGallery(
            ownerId,
            galleryIds
        )

        const galleryRows = galleries.map((gallery) => {
            const galleryId = String(gallery._id)
            const usage = usageByGallery.get(galleryId) ?? {
                rawsBytes: 0,
                selectionsBytes: 0,
                finalsBytes: 0,
                videoBytes: 0,
                totalBytes: 0,
            }

            return {
                id: galleryId,
                name: gallery.name ?? "",
                clientId: gallery.client?._id
                    ? String(gallery.client._id)
                    : null,
                clientName: gallery.client?.name ?? "",
                rawsBytes: usage.rawsBytes,
                selectionsBytes: usage.selectionsBytes,
                finalsBytes: usage.finalsBytes,
                videoBytes: usage.videoBytes,
                totalBytes: usage.totalBytes + usage.videoBytes,
            }
        })

        const sortedGalleries = sortStorageGalleries(galleryRows, sort)
        const plan = getPlanSummary(req.user)
        const limitBytes = plan.storageLimitBytes
        const videoUploadLimitBytes = getEffectiveVideoUploadLimitBytes(req.user)
        const entitlements = getUserEntitlements(req.user)

        return res.status(200).json({
            summary: {
                usedBytes: breakdown.totalBytes,
                limitBytes,
                planName: plan.planName,
                planId: plan.planId,
                features: entitlements.features,
                percentOfPlan: computePercentOfPlan(
                    breakdown.totalBytes,
                    limitBytes
                ),
                breakdown: {
                    rawsBytes: breakdown.rawsBytes,
                    selectionsBytes: breakdown.selectionsBytes,
                    finalsBytes: breakdown.finalsBytes,
                    collaborationBytes: breakdown.collaborationBytes ?? 0,
                },
                videoUsedBytes: breakdown.videoUsedBytes,
                videoUploadLimitBytes,
                videoPercentOfPlan: computePercentOfPlan(
                    breakdown.videoUsedBytes,
                    videoUploadLimitBytes
                ),
            },
            galleries: sortedGalleries,
            sort,
        })
    } catch (error) {
        console.error("Storage error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
