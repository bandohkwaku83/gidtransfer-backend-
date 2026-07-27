import GalleryPhoto from "../models/GalleryPhoto.js"
import { hammingDistanceHex } from "./galleryPhotoImageBuffer.js"
import { galleryAiSelectionEnabled } from "./galleryPhotoAiAnalysis.js"
import { scheduleGalleryPhotosReindex } from "./opensearchPhotos.js"

const DUPLICATE_HAMMING_THRESHOLD = 8

const SCENE_DIVERSITY_WEIGHT = 12

const photoAnalysisReady = (photo) =>
    photo?.aiAnalysis?.status === "ready" && !photo.rejectedByClient

const computeBaseScore = (photo) => {
    const ai = photo.aiAnalysis ?? {}
    let score = Number(ai.qualityScore) || 0

    if (ai.isBlurry) score *= 0.35
    if (ai.faceCount > 0) score += 8
    if (ai.eyesOpen === true) score += 6
    if (ai.eyesOpen === false) score -= 15
    if (Array.isArray(ai.issues) && ai.issues.length > 0) {
        score -= Math.min(20, ai.issues.length * 4)
    }

    return Math.max(0, Math.round(score))
}

const buildDuplicateClusters = (photos) => {
    const clusters = []
    const assigned = new Set()

    for (const photo of photos) {
        const id = String(photo._id)
        if (assigned.has(id)) continue

        const hash = photo.aiAnalysis?.perceptualHash
        if (!hash) {
            clusters.push([photo])
            assigned.add(id)
            continue
        }

        const cluster = [photo]
        assigned.add(id)

        for (const other of photos) {
            const otherId = String(other._id)
            if (assigned.has(otherId)) continue
            const otherHash = other.aiAnalysis?.perceptualHash
            if (!otherHash) continue
            if (hammingDistanceHex(hash, otherHash) <= DUPLICATE_HAMMING_THRESHOLD) {
                cluster.push(other)
                assigned.add(otherId)
            }
        }

        clusters.push(cluster)
    }

    return clusters
}

const assignDuplicateGroups = (photos) => {
    const clusters = buildDuplicateClusters(photos)
    const updates = []

    for (const cluster of clusters) {
        const sorted = [...cluster].sort(
            (a, b) => computeBaseScore(b) - computeBaseScore(a)
        )
        const groupId = String(sorted[0]._id)

        for (let i = 0; i < sorted.length; i += 1) {
            const photo = sorted[i]
            updates.push({
                photoId: photo._id,
                duplicateGroupId: groupId,
                isBestInGroup: i === 0,
            })
        }
    }

    return updates
}

const pickDiverseSuggestions = (candidates, limit) => {
    if (limit == null || limit <= 0) {
        return candidates.map((c) => c.photo)
    }

    const picked = []
    const sceneCounts = new Map()

    for (const candidate of candidates) {
        if (picked.length >= limit) break

        const scene = candidate.photo.aiAnalysis?.sceneLabel ?? "other"
        const sceneCount = sceneCounts.get(scene) ?? 0
        const diversityPenalty = sceneCount * SCENE_DIVERSITY_WEIGHT
        candidate.effectiveScore = candidate.score - diversityPenalty

        if (picked.length === 0 || candidate.effectiveScore >= 40) {
            picked.push(candidate)
            sceneCounts.set(scene, sceneCount + 1)
        }
    }

    if (picked.length < limit) {
        for (const candidate of candidates) {
            if (picked.length >= limit) break
            if (picked.some((p) => String(p.photo._id) === String(candidate.photo._id))) {
                continue
            }
            picked.push(candidate)
        }
    }

    return picked.map((c) => c.photo)
}

const buildSuggestionReason = (photo) => {
    const ai = photo.aiAnalysis ?? {}
    const parts = []
    if (ai.qualityScore >= 80) parts.push("High quality")
    if (ai.faceCount > 0 && ai.eyesOpen !== false) parts.push("Good faces")
    if (ai.isBestInGroup && ai.duplicateGroupId) parts.push("Best of similar shots")
    if (ai.sceneLabel && ai.sceneLabel !== "other") {
        parts.push(ai.sceneLabel.replace(/_/g, " "))
    }
    return parts.length > 0 ? parts.join(" · ") : "Recommended pick"
}

/**
 * Recompute duplicate groups and suggested flags for all analyzed photos in a gallery.
 */
export const refreshGalleryAiSuggestions = async (galleryId, { maxSelections } = {}) => {
    if (!galleryAiSelectionEnabled()) {
        return { enabled: false, suggestedCount: 0, readyCount: 0, pendingCount: 0 }
    }

    const photos = await GalleryPhoto.find({
        gallery: galleryId,
        deletedAt: null,
        isVideo: false,
        "aiAnalysis.status": "ready",
    }).exec()

    const duplicateUpdates = assignDuplicateGroups(photos)
    const duplicateByPhotoId = new Map(
        duplicateUpdates.map((u) => [String(u.photoId), u])
    )

    const candidates = photos
        .filter((photo) => {
            const dup = duplicateByPhotoId.get(String(photo._id))
            return dup?.isBestInGroup !== false
        })
        .map((photo) => ({
            photo,
            score: computeBaseScore(photo),
        }))
        .sort((a, b) => b.score - a.score)

    const suggestionLimit =
        maxSelections != null && maxSelections > 0
            ? maxSelections
            : Math.min(30, Math.max(10, Math.ceil(candidates.length * 0.2)))

    const suggestedPhotos = pickDiverseSuggestions(candidates, suggestionLimit)
    const suggestedIds = new Set(suggestedPhotos.map((p) => String(p._id)))

    const bulkOps = photos.map((photo) => {
        const id = String(photo._id)
        const dup = duplicateByPhotoId.get(id)
        const isSuggested = suggestedIds.has(id)
        const score = computeBaseScore(photo)

        return {
            updateOne: {
                filter: { _id: photo._id },
                update: {
                    $set: {
                        "aiAnalysis.duplicateGroupId": dup?.duplicateGroupId ?? null,
                        "aiAnalysis.isBestInGroup": dup?.isBestInGroup ?? true,
                        "aiAnalysis.suggested": isSuggested,
                        "aiAnalysis.suggestionScore": score,
                        "aiAnalysis.suggestionReason": isSuggested
                            ? buildSuggestionReason({
                                  ...photo.toObject(),
                                  aiAnalysis: {
                                      ...photo.aiAnalysis,
                                      duplicateGroupId: dup?.duplicateGroupId,
                                      isBestInGroup: dup?.isBestInGroup,
                                  },
                              })
                            : null,
                    },
                },
            },
        }
    })

    if (bulkOps.length > 0) {
        await GalleryPhoto.bulkWrite(bulkOps)
    }

    await GalleryPhoto.updateMany(
        {
            gallery: galleryId,
            deletedAt: null,
            isVideo: false,
            "aiAnalysis.status": "ready",
            _id: { $nin: photos.map((p) => p._id) },
        },
        {
            $set: {
                "aiAnalysis.suggested": false,
                "aiAnalysis.suggestionScore": null,
                "aiAnalysis.suggestionReason": null,
            },
        }
    )

    scheduleGalleryPhotosReindex(galleryId)

    const [readyCount, pendingCount, suggestedCount] = await Promise.all([
        GalleryPhoto.countDocuments({
            gallery: galleryId,
            deletedAt: null,
            isVideo: false,
            "aiAnalysis.status": "ready",
        }),
        GalleryPhoto.countDocuments({
            gallery: galleryId,
            deletedAt: null,
            isVideo: false,
            $or: [
                { "aiAnalysis.status": { $in: ["pending", "processing"] } },
                { "aiAnalysis.status": null },
            ],
        }),
        GalleryPhoto.countDocuments({
            gallery: galleryId,
            deletedAt: null,
            isVideo: false,
            "aiAnalysis.suggested": true,
        }),
    ])

    const duplicateGroups = buildDuplicateGroupSummary(photos, duplicateByPhotoId)

    return {
        enabled: true,
        ready: pendingCount === 0 && readyCount > 0,
        readyCount,
        pendingCount,
        suggestedCount,
        duplicateGroups,
    }
}

const buildDuplicateGroupSummary = (photos, duplicateByPhotoId) => {
    const groups = new Map()

    for (const photo of photos) {
        const dup = duplicateByPhotoId.get(String(photo._id))
        const groupId = dup?.duplicateGroupId
        if (!groupId) continue

        if (!groups.has(groupId)) {
            groups.set(groupId, {
                groupId,
                photoIds: [],
                recommendedPhotoId: groupId,
            })
        }
        groups.get(groupId).photoIds.push(String(photo._id))
    }

    return [...groups.values()].filter((g) => g.photoIds.length > 1)
}

export const loadGalleryAiSuggestions = async (galleryId, { maxSelections } = {}) => {
    const summary = await refreshGalleryAiSuggestions(galleryId, { maxSelections })

    const photos = await GalleryPhoto.find({
        gallery: galleryId,
        deletedAt: null,
        isVideo: false,
        "aiAnalysis.suggested": true,
    })
        .sort({ "aiAnalysis.suggestionScore": -1, sortOrder: 1, createdAt: 1 })
        .exec()

    return {
        ...summary,
        photos,
    }
}

export { photoAnalysisReady, computeBaseScore }
