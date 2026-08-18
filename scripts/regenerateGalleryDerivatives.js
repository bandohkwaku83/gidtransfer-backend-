/**
 * Backfill Sharp thumbnails + WebP previews for existing gallery photos.
 * Originals are not modified.
 *
 * Usage:
 *   node scripts/regenerateGalleryDerivatives.js
 *   node scripts/regenerateGalleryDerivatives.js --force
 */
import dotenv from "dotenv"
import mongoose from "mongoose"
import path from "path"
import { fileURLToPath } from "url"
import { mongoUrlFromEnv } from "../utils/mongoUrlFromEnv.js"
import { mongoConnectOptions } from "../utils/mongoConnectOptions.js"
import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import User from "../models/User.js"
import { isGalleryImageMime } from "../utils/galleryMediaTypes.js"
import {
    generateGalleryPhotoDerivatives,
    resolveWatermarkPreviewText,
} from "../utils/previewWatermark.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true })

const force = process.argv.includes("--force")
const CONCURRENCY = Math.max(
    1,
    Number(process.env.DERIVATIVE_QUEUE_CONCURRENCY) || 2
)

const mapWithLimit = async (items, limit, worker) => {
    let index = 0
    const run = async () => {
        while (index < items.length) {
            const current = index
            index += 1
            await worker(items[current], current)
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
}

const main = async () => {
    const mongoUrl = mongoUrlFromEnv()
    if (!mongoUrl) {
        console.error("MONGO_URL is not set")
        process.exit(1)
    }

    await mongoose.connect(mongoUrl, mongoConnectOptions())

    const filter = {
        deletedAt: null,
        isVideo: { $ne: true },
    }
    if (!force) {
        filter.$or = [
            { previewStoredFilename: null },
            { previewStoredFilename: { $exists: false } },
            { previewStoredFilename: "" },
            { thumbStoredFilename: null },
            { thumbStoredFilename: { $exists: false } },
            { thumbStoredFilename: "" },
        ]
    }

    const photos = await GalleryPhoto.find(filter)
        .select(
            "gallery owner storedFilename mimeType previewStoredFilename thumbStoredFilename"
        )
        .lean()
        .exec()

    const imagePhotos = photos.filter((photo) => isGalleryImageMime(photo.mimeType))
    console.log(
        `Generating previews for ${imagePhotos.length} photo(s)${
            force ? " (--force)" : ""
        }…`
    )

    const galleryCache = new Map()
    const studioCache = new Map()
    let ok = 0
    let failed = 0

    await mapWithLimit(imagePhotos, CONCURRENCY, async (photo, i) => {
        const galleryId = String(photo.gallery)
        try {
            let gallery = galleryCache.get(galleryId)
            if (!gallery) {
                gallery = await Gallery.findById(galleryId)
                    .select("watermarkPreviewEnabled owner")
                    .lean()
                    .exec()
                galleryCache.set(galleryId, gallery)
            }

            const ownerId = String(gallery?.owner ?? photo.owner)
            let studio = studioCache.get(ownerId)
            if (studio === undefined) {
                const owner = await User.findById(ownerId).select("studio").lean().exec()
                studio = owner?.studio ?? null
                studioCache.set(ownerId, studio)
            }

            const applyWatermark = gallery?.watermarkPreviewEnabled === true
            const derivatives = await generateGalleryPhotoDerivatives({
                galleryId,
                storedFilename: photo.storedFilename,
                mimeType: photo.mimeType,
                watermarkText: resolveWatermarkPreviewText(studio),
                applyWatermark,
            })

            await GalleryPhoto.updateOne(
                { _id: photo._id },
                {
                    $set: {
                        thumbStoredFilename: derivatives.thumbStoredFilename,
                        previewStoredFilename: derivatives.previewStoredFilename,
                        previewWmStoredFilename: derivatives.previewWmStoredFilename,
                    },
                }
            )
            ok += 1
            if ((i + 1) % 10 === 0 || i === imagePhotos.length - 1) {
                console.log(`  ${i + 1}/${imagePhotos.length} (${ok} ok, ${failed} failed)`)
            }
        } catch (err) {
            failed += 1
            console.error(`  failed ${photo._id}:`, err.message)
        }
    })

    await mongoose.disconnect()
    console.log(`Done. ${ok} updated, ${failed} failed.`)
}

main().catch(async (err) => {
    console.error(err)
    try {
        await mongoose.disconnect()
    } catch {
        /* ignore */
    }
    process.exit(1)
})
