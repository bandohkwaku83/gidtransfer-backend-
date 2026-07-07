import GalleryPhoto from "../models/GalleryPhoto.js"
import { isGalleryImageMime } from "./galleryMediaTypes.js"
import { generateGalleryPhotoDerivatives, galleryThumbMaxPx } from "./previewWatermark.js"

const MAX_CONCURRENT = Math.max(
    1,
    Number(process.env.DERIVATIVE_QUEUE_CONCURRENCY) || 2
)

const queue = []
let active = 0

/** True when thumbnails / watermarked previews are not pending for this photo. */
export const photoDerivativesReady = (photo) => {
    if (photo?.isVideo === true) return true
    if (!isGalleryImageMime(photo?.mimeType)) return true
    if (galleryThumbMaxPx() > 0 && !photo?.thumbStoredFilename) return false
    return true
}

const processJob = async (job) => {
    const {
        photoId,
        galleryId,
        storedFilename,
        mimeType,
        watermarkText,
        applyWatermark,
    } = job

    try {
        const derivatives = await generateGalleryPhotoDerivatives({
            galleryId,
            storedFilename,
            mimeType,
            watermarkText,
            applyWatermark,
        })

        await GalleryPhoto.updateOne(
            { _id: photoId },
            {
                $set: {
                    thumbStoredFilename: derivatives.thumbStoredFilename,
                    previewWmStoredFilename: derivatives.previewWmStoredFilename,
                },
            }
        )
    } catch (err) {
        console.error("galleryDerivativeQueue: failed for photo", photoId, err)
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
 * Generate thumbnail + optional watermarked preview after the original is stored.
 * Runs in-process; safe to call from upload handlers without awaiting.
 */
export const scheduleGalleryPhotoDerivatives = ({
    photoId,
    galleryId,
    storedFilename,
    mimeType,
    watermarkText,
    applyWatermark = false,
}) => {
    if (!photoId || !galleryId || !storedFilename) return
    if (!isGalleryImageMime(mimeType)) return

    queue.push({
        photoId,
        galleryId,
        storedFilename,
        mimeType,
        watermarkText,
        applyWatermark,
    })
    drain()
}
