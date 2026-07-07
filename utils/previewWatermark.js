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

const parseThumbMaxPx = () => {
    const raw = process.env.GALLERY_THUMB_MAX_PX?.trim()
    if (raw === undefined || raw === "") return 0
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return 0
    return Math.max(320, Math.floor(n))
}

/** Optional grid thumbnails — disabled unless GALLERY_THUMB_MAX_PX is set. Originals are never resized. */
export const galleryThumbMaxPx = () => parseThumbMaxPx()

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

const derivativeExtension = (storedFilename) => {
    const ext = path.extname(storedFilename).toLowerCase()
    return ext && ext !== "." ? ext : ".jpg"
}

const derivativeNames = (storedFilename) => {
    const parsed = path.parse(storedFilename)
    const base = parsed.name
    const ext = derivativeExtension(storedFilename)
    return {
        thumbStoredFilename: `${base}-thumb${ext}`,
        previewWmStoredFilename: `${base}-preview-wm${ext}`,
    }
}

const applyOutputFormat = (pipeline, meta) => {
    const format = (meta.format ?? "jpeg").toLowerCase()
    switch (format) {
        case "png":
            return pipeline.png({ compressionLevel: 6 })
        case "webp":
            return pipeline.webp({ quality: 100, lossless: true })
        case "gif":
            return pipeline.gif()
        case "jpeg":
        case "jpg":
        default:
            return pipeline.jpeg({
                quality: 100,
                mozjpeg: true,
                chromaSubsampling: "4:4:4",
            })
    }
}

const galleryPhotoPath = (galleryId, storedFilename) =>
    path.join(GALLERY_PHOTOS_DIR, String(galleryId), storedFilename)

const mimeForDerivative = (storedFilename) => {
    const ext = path.extname(storedFilename).toLowerCase()
    if (ext === ".png") return "image/png"
    if (ext === ".webp") return "image/webp"
    if (ext === ".gif") return "image/gif"
    return "image/jpeg"
}

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
 * Generate thumbnail and optional watermarked preview beside the stored original.
 * Returns derivative filenames; skips work for non-image media.
 */
export async function generateGalleryPhotoDerivatives({
    galleryId,
    storedFilename,
    mimeType,
    watermarkText,
    applyWatermark = false,
}) {
    if (!isGalleryImageMime(mimeType)) {
        return { thumbStoredFilename: null, previewWmStoredFilename: null }
    }

    const localPath = galleryPhotoStoragePath(galleryId, storedFilename)
    if (!s3Configured() && (!localPath || !fs.existsSync(localPath))) {
        return { thumbStoredFilename: null, previewWmStoredFilename: null }
    }

    const sourceBuffer = await readSourceBuffer(galleryId, storedFilename)
    if (!sourceBuffer) {
        return { thumbStoredFilename: null, previewWmStoredFilename: null }
    }

    const { thumbStoredFilename, previewWmStoredFilename } =
        derivativeNames(storedFilename)
    const thumbMime = mimeForDerivative(thumbStoredFilename)
    const thumbMaxPx = parseThumbMaxPx()

    const meta = await sharp(sourceBuffer, { failOn: "none" }).rotate().metadata()

    let thumbResultFilename = null
    if (thumbMaxPx > 0) {
        const thumbBuffer = await applyOutputFormat(
            sharp(sourceBuffer, { failOn: "none" })
                .rotate()
                .resize({
                    width: thumbMaxPx,
                    height: thumbMaxPx,
                    fit: "inside",
                    withoutEnlargement: true,
                }),
            meta
        ).toBuffer()

        await writeDerivative(galleryId, thumbStoredFilename, thumbBuffer, thumbMime)
        thumbResultFilename = thumbStoredFilename
    } else {
        await removeDerivative(galleryId, thumbStoredFilename)
    }

    if (applyWatermark) {
        const { data, info } = await sharp(sourceBuffer, { failOn: "none" })
            .rotate()
            .toBuffer({ resolveWithObject: true })
        const overlay = tiledWatermarkSvg(
            watermarkText,
            info.width ?? meta.width ?? 1,
            info.height ?? meta.height ?? 1
        )

        const previewBuffer = await applyOutputFormat(
            sharp(data).composite([{ input: overlay, blend: "over" }]),
            meta
        ).toBuffer()

        await writeDerivative(
            galleryId,
            previewWmStoredFilename,
            previewBuffer,
            mimeForDerivative(previewWmStoredFilename)
        )
    } else {
        await removeDerivative(galleryId, previewWmStoredFilename)
    }

    return {
        thumbStoredFilename: thumbResultFilename,
        previewWmStoredFilename: applyWatermark ? previewWmStoredFilename : null,
    }
}

export const deleteGalleryPhotoDerivatives = (galleryId, photo) => {
    if (!galleryId || !photo) return
    const names = derivativeNames(photo.storedFilename ?? "")
    for (const filename of [
        photo.thumbStoredFilename,
        photo.previewWmStoredFilename,
        names.thumbStoredFilename,
        names.previewWmStoredFilename,
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
