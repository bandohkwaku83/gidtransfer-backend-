import fs from "fs"
import path from "path"
import sharp from "sharp"
import {
    GALLERY_PHOTOS_DIR,
    galleryPhotoObjectKey,
    galleryPhotoStoragePath,
} from "./galleryPhotoStorage.js"
import { isGalleryImageMime } from "./galleryMediaTypes.js"
import {
    s3Configured,
    getObjectBuffer,
    uploadBuffer,
    deleteObject,
} from "./s3Storage.js"

const parsePositivePx = (raw, fallback, min) => {
    if (raw === undefined || raw === "") return fallback
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.max(min, Math.floor(n))
}

const parseThumbMaxPx = () => {
    const raw = process.env.GALLERY_THUMB_MAX_PX?.trim()
    // Default on (800) for progressive JPEG grid delivery; set 0 to disable.
    // 800 keeps retina tiles sharp without shipping camera-sized masters in the grid.
    return parsePositivePx(raw, 800, 320)
}

const parsePreviewMaxPx = () => {
    const raw = process.env.GALLERY_PREVIEW_MAX_PX?.trim()
    // Default 2560px so lightbox stays sharp on retina (2x of a ~1280 CSS-px stage).
    return parsePositivePx(raw, 2560, 1600)
}

/** Optional grid thumbnails — default 800px progressive JPEG; set GALLERY_THUMB_MAX_PX=0 to disable. Originals are never resized. */
export const galleryThumbMaxPx = () => parseThumbMaxPx()

/** Lightbox / client preview — default 2560px WebP; set GALLERY_PREVIEW_MAX_PX=0 to disable. */
export const galleryPreviewMaxPx = () => parsePreviewMaxPx()

const escapeXml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")

/** Default text composited onto preview images (env override, then studio name). */
export const resolveWatermarkPreviewText = (studio) => {
    const envText = process.env.WATERMARK_PREVIEW_TEXT?.trim()
    if (envText) return envText
    const companyName = studio?.companyName?.trim()
    if (companyName) return companyName
    return "Preview"
}

const tiledWatermarkSvg = (text, width, height) => {
    const safeText = escapeXml(text)
    const fontSize = Math.max(18, Math.min(42, Math.round(width / 18)))
    const tileW = Math.max(220, fontSize * Math.max(6, safeText.length * 0.55))
    const tileH = Math.max(120, fontSize * 2.4)

    return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="wm" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
      <text x="0" y="${Math.round(tileH * 0.65)}" fill="rgba(255,255,255,0.38)" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${safeText}</text>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#wm)" />
</svg>`)
}

/** Progressive JPEG for faster perceived loading (grid thumbs). */
const thumbJpegQuality = () => {
    const n = Number(process.env.GALLERY_THUMB_JPEG_QUALITY)
    if (Number.isFinite(n) && n >= 40 && n <= 100) return Math.floor(n)
    return 82
}

/** WebP quality for lightbox previews (and watermarked previews). */
const previewWebpQuality = () => {
    const n = Number(process.env.GALLERY_PREVIEW_WEBP_QUALITY)
    if (Number.isFinite(n) && n >= 40 && n <= 100) return Math.floor(n)
    return 90
}

const derivativeNames = (storedFilename) => {
    const parsed = path.parse(storedFilename)
    const base = parsed.name
    return {
        // Always progressive JPEG — avoids baseline top-to-bottom paint on grid/lightbox.
        thumbStoredFilename: `${base}-thumb.jpg`,
        previewStoredFilename: `${base}-preview.webp`,
        previewWmStoredFilename: `${base}-preview-wm.webp`,
        legacyPreviewWmJpeg: `${base}-preview-wm.jpg`,
    }
}

const applyProgressiveJpeg = (pipeline, quality) =>
    pipeline.jpeg({
        quality,
        mozjpeg: true,
        progressive: true,
        chromaSubsampling: "4:2:0",
    })

const applyPreviewWebp = (pipeline, quality) =>
    pipeline.webp({
        quality,
        effort: 5,
        preset: "photo",
        smartSubsample: false,
    })

const resizeInside = (pipeline, maxPx) =>
    pipeline.resize({
        width: maxPx,
        height: maxPx,
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3",
        fastShrinkOnLoad: false,
    })

const galleryPhotoPath = (galleryId, storedFilename) =>
    path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)

const readSourceBuffer = async (galleryId, storedFilename) => {
    if (s3Configured()) {
        const key = galleryPhotoObjectKey(galleryId, storedFilename)
        return getObjectBuffer(key)
    }
    const sourcePath = galleryPhotoPath(galleryId, storedFilename)
    if (!fs.existsSync(sourcePath)) return null
    return fs.promises.readFile(sourcePath)
}

const writeDerivative = async (galleryId, storedFilename, buffer, mimeType) => {
    if (s3Configured()) {
        const key = galleryPhotoObjectKey(galleryId, storedFilename)
        await uploadBuffer(key, buffer, mimeType)
        return
    }
    const dest = galleryPhotoPath(galleryId, storedFilename)
    await fs.promises.writeFile(dest, buffer)
}

const removeDerivative = async (galleryId, storedFilename) => {
    if (s3Configured()) {
        await deleteObject(galleryPhotoObjectKey(galleryId, storedFilename))
        return
    }
    const fullPath = galleryPhotoPath(galleryId, storedFilename)
    try {
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
    } catch {
        /* ignore */
    }
}

/**
 * Generate thumbnail + high-quality WebP preview (and optional watermarked preview)
 * beside the stored original. Originals are never resized or overwritten.
 */
export async function generateGalleryPhotoDerivatives({
    galleryId,
    storedFilename,
    mimeType,
    watermarkText,
    applyWatermark = false,
}) {
    const empty = {
        thumbStoredFilename: null,
        previewStoredFilename: null,
        previewWmStoredFilename: null,
    }

    if (!isGalleryImageMime(mimeType)) {
        return empty
    }

    const localPath = galleryPhotoStoragePath(galleryId, storedFilename)
    if (!s3Configured() && (!localPath || !fs.existsSync(localPath))) {
        return empty
    }

    const sourceBuffer = await readSourceBuffer(galleryId, storedFilename)
    if (!sourceBuffer) {
        return empty
    }

    const {
        thumbStoredFilename,
        previewStoredFilename,
        previewWmStoredFilename,
        legacyPreviewWmJpeg,
    } = derivativeNames(storedFilename)
    const thumbMaxPx = parseThumbMaxPx()
    const previewMaxPx = parsePreviewMaxPx()

    let thumbResultFilename = null
    if (thumbMaxPx > 0) {
        const thumbBuffer = await applyProgressiveJpeg(
            resizeInside(
                sharp(sourceBuffer, { failOn: "none" }).rotate(),
                thumbMaxPx
            ),
            thumbJpegQuality()
        ).toBuffer()

        await writeDerivative(
            galleryId,
            thumbStoredFilename,
            thumbBuffer,
            "image/jpeg"
        )
        thumbResultFilename = thumbStoredFilename
    } else {
        await removeDerivative(galleryId, thumbStoredFilename)
    }

    let previewResultFilename = null
    if (previewMaxPx > 0) {
        const previewBuffer = await applyPreviewWebp(
            resizeInside(
                sharp(sourceBuffer, { failOn: "none" }).rotate(),
                previewMaxPx
            ),
            previewWebpQuality()
        ).toBuffer()

        await writeDerivative(
            galleryId,
            previewStoredFilename,
            previewBuffer,
            "image/webp"
        )
        previewResultFilename = previewStoredFilename
    } else {
        await removeDerivative(galleryId, previewStoredFilename)
    }

    let previewWmResultFilename = null
    if (applyWatermark) {
        const wmMaxPx = previewMaxPx > 0 ? previewMaxPx : 2560
        const { data, info } = await resizeInside(
            sharp(sourceBuffer, { failOn: "none" }).rotate(),
            wmMaxPx
        ).toBuffer({ resolveWithObject: true })

        const overlay = tiledWatermarkSvg(
            watermarkText,
            info.width ?? 1,
            info.height ?? 1
        )

        const previewWmBuffer = await applyPreviewWebp(
            sharp(data).composite([{ input: overlay, blend: "over" }]),
            previewWebpQuality()
        ).toBuffer()

        await writeDerivative(
            galleryId,
            previewWmStoredFilename,
            previewWmBuffer,
            "image/webp"
        )
        await removeDerivative(galleryId, legacyPreviewWmJpeg)
        previewWmResultFilename = previewWmStoredFilename
    } else {
        await removeDerivative(galleryId, previewWmStoredFilename)
        await removeDerivative(galleryId, legacyPreviewWmJpeg)
    }

    return {
        thumbStoredFilename: thumbResultFilename,
        previewStoredFilename: previewResultFilename,
        previewWmStoredFilename: previewWmResultFilename,
    }
}

export const deleteGalleryPhotoDerivatives = (galleryId, photo) => {
    if (!galleryId || !photo) return
    const names = derivativeNames(photo.storedFilename ?? "")
    for (const filename of [
        photo.thumbStoredFilename,
        photo.previewStoredFilename,
        photo.previewWmStoredFilename,
        names.thumbStoredFilename,
        names.previewStoredFilename,
        names.previewWmStoredFilename,
        names.legacyPreviewWmJpeg,
    ]) {
        if (!filename) continue
        if (s3Configured()) {
            deleteObject(galleryPhotoObjectKey(galleryId, filename))
        } else {
            const fullPath = galleryPhotoPath(galleryId, filename)
            try {
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath)
            } catch {
                /* ignore */
            }
        }
    }
}
