import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import {
    generateGalleryVideoDash,
    galleryVideoDashEnabled,
} from "./galleryVideoDash.js"
import { isGalleryVideoMime } from "./galleryMediaTypes.js"

const MAX_CONCURRENT = Math.max(
    1,
    Number(process.env.VIDEO_DASH_QUEUE_CONCURRENCY) || 1
)

const queue = []
let active = 0

/** True when DASH packaging is finished or not applicable. */
export const videoStreamingReady = (doc) => {
    if (doc?.isVideo !== true && !isGalleryVideoMime(doc?.mimeType)) return true
    if (!galleryVideoDashEnabled()) return true
    const status = doc?.dashStatus
    if (!status || status === "pending" || status === "processing") return false
    return true
}

const ModelForKind = (kind) => (kind === "final" ? GalleryFinal : GalleryPhoto)

const processJob = async (job) => {
    const { kind, mediaId, galleryId, storedFilename, sizeBytes } = job
    const Model = ModelForKind(kind)

    try {
        await Model.updateOne(
            { _id: mediaId },
            { $set: { dashStatus: "processing", dashError: null } }
        )

        const result = await generateGalleryVideoDash({
            kind,
            galleryId,
            storedFilename,
            sizeBytes,
        })

        await Model.updateOne(
            { _id: mediaId },
            {
                $set: {
                    dashManifestStoredFilename: result.dashManifestStoredFilename,
                    posterStoredFilename: result.posterStoredFilename,
                    dashStatus: result.dashStatus,
                    dashError: result.dashError,
                },
            }
        )
    } catch (err) {
        console.error("galleryVideoQueue: failed for", kind, mediaId, err)
        await Model.updateOne(
            { _id: mediaId },
            {
                $set: {
                    dashStatus: "failed",
                    dashError: err?.message?.slice(0, 500) || "DASH encode failed",
                    dashManifestStoredFilename: null,
                    posterStoredFilename: null,
                },
            }
        ).catch(() => {})
    }
}

const drain = () => {
    while (active < MAX_CONCURRENT && queue.length > 0) {
        active += 1
        const job = queue.shift()
        processJob(job).finally(() => {
            active -= 1
            drain()
        })
    }
}

/**
 * Package video as MPEG-DASH (multi-bitrate) + progressive JPEG poster.
 * Safe to call without awaiting from upload handlers.
 */
export const scheduleGalleryVideoDash = ({
    kind = "photo",
    mediaId,
    galleryId,
    storedFilename,
    mimeType,
    sizeBytes = 0,
    isVideo = false,
}) => {
    if (!mediaId || !galleryId || !storedFilename) return
    if (!galleryVideoDashEnabled()) return
    if (!isVideo && !isGalleryVideoMime(mimeType)) return

    queue.push({
        kind,
        mediaId,
        galleryId,
        storedFilename,
        sizeBytes,
    })
    drain()
}

export const galleryVideoDashQueueDepth = () => queue.length + active
