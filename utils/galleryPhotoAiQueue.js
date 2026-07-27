import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import { isGalleryImageMime } from "./galleryMediaTypes.js"
import { analyzeGalleryPhoto, galleryAiSelectionEnabled } from "./galleryPhotoAiAnalysis.js"
import { refreshGalleryAiSuggestions } from "./galleryPhotoAiSuggestions.js"
import { scheduleGalleryPhotosReindex } from "./opensearchPhotos.js"

const MAX_CONCURRENT = Math.max(
    1,
    Number(process.env.GALLERY_AI_QUEUE_CONCURRENCY) || 1
)

/** @type {Array<{ photoId: import("mongoose").Types.ObjectId, galleryId: string }>} */
const queue = []
let active = 0
/** Gallery IDs currently being analyzed (in-flight jobs). */
const activeByGallery = new Map()
const galleriesPendingRefresh = new Set()

const galleryKey = (galleryId) => String(galleryId)

const scheduleGalleryRefresh = (galleryId) => {
    galleriesPendingRefresh.add(galleryKey(galleryId))
}

const flushGalleryRefreshes = async () => {
    const ids = [...galleriesPendingRefresh]
    galleriesPendingRefresh.clear()
    await Promise.all(
        ids.map(async (galleryId) => {
            try {
                const gallery = await Gallery.findById(galleryId)
                    .select("maxSelections aiSuggestionRunStatus")
                    .lean()
                if (!gallery) return
                if (
                    gallery.aiSuggestionRunStatus === "terminated" ||
                    gallery.aiSuggestionRunStatus === "idle"
                ) {
                    return
                }
                await refreshGalleryAiSuggestions(galleryId, {
                    maxSelections: gallery.maxSelections ?? null,
                })
                await maybeCompleteRun(galleryId)
            } catch (err) {
                console.error("galleryPhotoAiQueue: refresh failed", galleryId, err)
            }
        })
    )
}

const getQueuedCountForGallery = (galleryId) => {
    const key = galleryKey(galleryId)
    return queue.filter((j) => j.galleryId === key).length
}

const removeQueuedJobsForGallery = (galleryId) => {
    const key = galleryKey(galleryId)
    for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i].galleryId === key) queue.splice(i, 1)
    }
}

const isGalleryRunnable = async (galleryId) => {
    const gallery = await Gallery.findById(galleryId)
        .select("aiSuggestionRunStatus")
        .lean()
    return gallery?.aiSuggestionRunStatus === "running"
}

const processJob = async (job) => {
    const { photoId, galleryId } = job
    const key = galleryKey(galleryId)
    activeByGallery.set(key, (activeByGallery.get(key) ?? 0) + 1)

    try {
        if (!(await isGalleryRunnable(galleryId))) {
            await GalleryPhoto.updateOne(
                {
                    _id: photoId,
                    "aiAnalysis.status": { $in: ["pending", "processing"] },
                },
                { $set: { "aiAnalysis.status": null } }
            )
            return
        }
        await analyzeGalleryPhoto(photoId)
    } catch (err) {
        console.error("galleryPhotoAiQueue: analysis failed", photoId, err?.message ?? err)
    } finally {
        const n = (activeByGallery.get(key) ?? 1) - 1
        if (n <= 0) activeByGallery.delete(key)
        else activeByGallery.set(key, n)
        if (galleryId) scheduleGalleryRefresh(galleryId)
    }
}

const drain = () => {
    while (active < MAX_CONCURRENT && queue.length > 0) {
        active += 1
        const job = queue.shift()
        processJob(job).finally(() => {
            active -= 1
            if (queue.length === 0 && active === 0) {
                flushGalleryRefreshes().finally(drain)
            } else {
                drain()
            }
        })
    }
}

const enqueuePhoto = (photoId, galleryId) => {
    const key = galleryKey(galleryId)
    if (queue.some((j) => String(j.photoId) === String(photoId) && j.galleryId === key)) {
        return false
    }
    GalleryPhoto.updateOne(
        { _id: photoId, "aiAnalysis.status": { $in: [null, "failed"] } },
        { $set: { "aiAnalysis.status": "pending" } }
    ).catch(() => {})
    queue.push({ photoId, galleryId: key })
    return true
}

/** Queue vision analysis for one photo only when that gallery run is active. */
export const scheduleGalleryPhotoAiAnalysis = ({ photoId, galleryId }) => {
    if (!photoId || !galleryId || !galleryAiSelectionEnabled()) return
    // Upload-time scheduling is disabled — clients must start a run explicitly.
}

const queueUnanalyzedPhotos = async (galleryId) => {
    const rows = await GalleryPhoto.find({
        gallery: galleryId,
        deletedAt: null,
        isVideo: false,
        $or: [
            { "aiAnalysis.status": null },
            { "aiAnalysis.status": "failed" },
            { "aiAnalysis.status": "pending" },
        ],
    })
        .select("_id mimeType")
        .lean()

    let queued = 0
    for (const row of rows) {
        if (!isGalleryImageMime(row.mimeType)) continue
        if (enqueuePhoto(row._id, galleryId)) queued += 1
    }
    if (queued > 0) drain()
    return queued
}

const maybeCompleteRun = async (galleryId) => {
    const gallery = await Gallery.findById(galleryId)
        .select("aiSuggestionRunStatus")
        .lean()
    if (gallery?.aiSuggestionRunStatus !== "running") return

    const pendingCount = await GalleryPhoto.countDocuments({
        gallery: galleryId,
        deletedAt: null,
        isVideo: false,
        $or: [
            { "aiAnalysis.status": { $in: ["pending", "processing"] } },
            { "aiAnalysis.status": null },
        ],
    })
    const queued = getQueuedCountForGallery(galleryId)
    const inFlight = activeByGallery.get(galleryKey(galleryId)) ?? 0

    if (pendingCount === 0 && queued === 0 && inFlight === 0) {
        await Gallery.updateOne(
            { _id: galleryId, aiSuggestionRunStatus: "running" },
            {
                $set: {
                    aiSuggestionRunStatus: "idle",
                    aiSuggestionRunPausedAt: null,
                },
            }
        )
    }
}

export const galleryAiAnalysisSummary = async (galleryId) => {
    if (!galleryAiSelectionEnabled()) {
        return {
            enabled: false,
            runStatus: "idle",
            ready: false,
            readyCount: 0,
            pendingCount: 0,
            suggestedCount: 0,
            queuedCount: 0,
        }
    }

    const gallery = await Gallery.findById(galleryId)
        .select(
            "aiSuggestionRunStatus aiSuggestionRunStartedAt aiSuggestionRunPausedAt aiSuggestionRunTerminatedAt"
        )
        .lean()

    const runStatus = gallery?.aiSuggestionRunStatus ?? "idle"

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

    return {
        enabled: true,
        runStatus,
        startedAt: gallery?.aiSuggestionRunStartedAt ?? null,
        pausedAt: gallery?.aiSuggestionRunPausedAt ?? null,
        terminatedAt: gallery?.aiSuggestionRunTerminatedAt ?? null,
        ready: pendingCount === 0 && readyCount > 0,
        readyCount,
        pendingCount,
        suggestedCount,
        queuedCount: getQueuedCountForGallery(galleryId),
    }
}

/** Start or resume AI suggestion analysis for a gallery. */
export const startGalleryAiAnalysis = async (galleryId, { maxSelections } = {}) => {
    if (!galleryAiSelectionEnabled()) {
        return { enabled: false, runStatus: "idle", queued: 0 }
    }

    const gallery = await Gallery.findById(galleryId)
    if (!gallery) {
        return { enabled: true, runStatus: "idle", queued: 0, error: "not_found" }
    }

    if (gallery.aiSuggestionRunStatus === "running") {
        const queued = await queueUnanalyzedPhotos(galleryId)
        const summary = await galleryAiAnalysisSummary(galleryId)
        return { enabled: true, queued, ...summary }
    }

    gallery.aiSuggestionRunStatus = "running"
    gallery.aiSuggestionRunStartedAt = gallery.aiSuggestionRunStartedAt ?? new Date()
    gallery.aiSuggestionRunPausedAt = null
    gallery.aiSuggestionRunTerminatedAt = null
    await gallery.save()

    const queued = await queueUnanalyzedPhotos(galleryId)
    await refreshGalleryAiSuggestions(galleryId, { maxSelections })
    const summary = await galleryAiAnalysisSummary(galleryId)

    return { enabled: true, queued, message: "AI suggestions started", ...summary }
}

/** Pause a running AI suggestion job — stops queueing more work for this gallery. */
export const pauseGalleryAiAnalysis = async (galleryId) => {
    if (!galleryAiSelectionEnabled()) {
        return { enabled: false, runStatus: "idle" }
    }

    const gallery = await Gallery.findById(galleryId)
    if (!gallery) {
        return { enabled: true, runStatus: "idle", error: "not_found" }
    }

    if (gallery.aiSuggestionRunStatus !== "running") {
        const summary = await galleryAiAnalysisSummary(galleryId)
        return {
            enabled: true,
            message:
                gallery.aiSuggestionRunStatus === "paused"
                    ? "AI suggestions already paused"
                    : `Cannot pause while status is ${gallery.aiSuggestionRunStatus}`,
            ...summary,
        }
    }

    removeQueuedJobsForGallery(galleryId)

    await GalleryPhoto.updateMany(
        {
            gallery: galleryId,
            "aiAnalysis.status": "pending",
        },
        { $set: { "aiAnalysis.status": null } }
    )

    gallery.aiSuggestionRunStatus = "paused"
    gallery.aiSuggestionRunPausedAt = new Date()
    await gallery.save()

    const summary = await galleryAiAnalysisSummary(galleryId)
    return { enabled: true, message: "AI suggestions paused", ...summary }
}

/**
 * Terminate AI suggestions — clears queue, drops pending work, clears suggested flags.
 * Analyzed photo metadata is kept so a later start can reuse ready results.
 */
export const terminateGalleryAiAnalysis = async (galleryId) => {
    if (!galleryAiSelectionEnabled()) {
        return { enabled: false, runStatus: "idle" }
    }

    const gallery = await Gallery.findById(galleryId)
    if (!gallery) {
        return { enabled: true, runStatus: "idle", error: "not_found" }
    }

    removeQueuedJobsForGallery(galleryId)

    await GalleryPhoto.updateMany(
        {
            gallery: galleryId,
            "aiAnalysis.status": { $in: ["pending", "processing"] },
        },
        { $set: { "aiAnalysis.status": null } }
    )

    await GalleryPhoto.updateMany(
        { gallery: galleryId },
        {
            $set: {
                "aiAnalysis.suggested": false,
                "aiAnalysis.suggestionScore": null,
                "aiAnalysis.suggestionReason": null,
            },
        }
    )

    scheduleGalleryPhotosReindex(galleryId)

    gallery.aiSuggestionRunStatus = "terminated"
    gallery.aiSuggestionRunTerminatedAt = new Date()
    gallery.aiSuggestionRunPausedAt = null
    await gallery.save()

    const summary = await galleryAiAnalysisSummary(galleryId)
    return { enabled: true, message: "AI suggestions terminated", ...summary }
}

/** @deprecated Prefer startGalleryAiAnalysis — kept for any internal callers. */
export const ensureGalleryAiAnalysis = async (galleryId, options = {}) =>
    startGalleryAiAnalysis(galleryId, options)
