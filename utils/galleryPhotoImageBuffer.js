import fs from "fs"
import path from "path"
import sharp from "sharp"
import {
    GALLERY_PHOTOS_DIR,
    galleryPhotoObjectKey,
} from "./galleryPhotoStorage.js"
import { getObjectBuffer } from "./s3Storage.js"
import { s3Configured } from "./s3Storage.js"

const galleryPhotoPath = (galleryId, storedFilename) =>
    path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)

const readStoredFileBuffer = async (galleryId, storedFilename) => {
    if (!galleryId || !storedFilename) return null
    if (s3Configured()) {
        return getObjectBuffer(galleryPhotoObjectKey(galleryId, storedFilename))
    }
    const fullPath = galleryPhotoPath(galleryId, storedFilename)
    if (!fs.existsSync(fullPath)) return null
    return fs.promises.readFile(fullPath)
}

/**
 * Load a gallery photo buffer for AI analysis — prefers thumbnail, falls back to original.
 * Returns a JPEG buffer resized for vision API (max 768px).
 */
export const readGalleryPhotoAnalysisBuffer = async (photo) => {
    const galleryId = String(photo.gallery)
    const filename =
        photo.thumbStoredFilename?.trim() || photo.storedFilename?.trim()
    if (!filename) return null

    const raw = await readStoredFileBuffer(galleryId, filename)
    if (!raw) return null

    return sharp(raw, { failOn: "none" })
        .rotate()
        .resize({
            width: 768,
            height: 768,
            fit: "inside",
            withoutEnlargement: true,
        })
        .jpeg({ quality: 82 })
        .toBuffer()
}

/** Difference hash (dHash) for near-duplicate clustering. */
export const computePerceptualHash = async (jpegBuffer) => {
    if (!jpegBuffer) return null

    const { data, info } = await sharp(jpegBuffer)
        .greyscale()
        .resize(9, 8, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true })

    let hash = 0n
    const width = info.width ?? 9
    const height = info.height ?? 8

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width - 1; x += 1) {
            const left = data[y * width + x]
            const right = data[y * width + x + 1]
            hash = (hash << 1n) | (left < right ? 1n : 0n)
        }
    }

    return hash.toString(16).padStart(16, "0")
}

export const hammingDistanceHex = (a, b) => {
    if (!a || !b) return Infinity
    try {
        let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`)
        let dist = 0
        while (xor > 0n) {
            dist += Number(xor & 1n)
            xor >>= 1n
        }
        return dist
    } catch {
        return Infinity
    }
}
