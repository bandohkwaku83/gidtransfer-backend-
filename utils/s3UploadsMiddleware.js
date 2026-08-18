import fs from "fs"
import path from "path"
import { pipeline } from "stream/promises"
import { s3Configured, getObjectStream, headObject } from "./s3Storage.js"
import { galleryPhotoObjectKey } from "./galleryPhotoStorage.js"
import { galleryFinalObjectKey } from "./galleryFinalStorage.js"
import { mimeForMediaFilename } from "./ffmpeg.js"

const GALLERY_UPLOAD_PREFIXES = new Set(["gallery-photos", "gallery-finals"])

const objectKeyForPrefix = (prefix, galleryId, relativePath) => {
    if (prefix === "gallery-photos") {
        return galleryPhotoObjectKey(galleryId, relativePath)
    }
    return galleryFinalObjectKey(galleryId, relativePath)
}

/**
 * When S3 stores gallery media, serve GET /uploads/gallery-photos|gallery-finals/…
 * from the bucket if the file is not on local disk.
 * Supports nested DASH paths: …/{galleryId}/{uuid}-dash/manifest.mpd
 */
export const createS3UploadsMiddleware = ({ uploadsDir }) => {
    return async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next()
        if (!s3Configured()) return next()

        const pathname = decodeURIComponent(
            (req.originalUrl || req.url || "").split("?")[0]
        )
        const match = pathname.match(
            /\/uploads\/(gallery-photos|gallery-finals)\/([^/]+)\/(.+)$/
        )
        if (!match) return next()

        const [, prefix, galleryId, relativePath] = match
        if (!GALLERY_UPLOAD_PREFIXES.has(prefix)) return next()
        if (!relativePath || relativePath.includes("..")) return next()

        const localPath = path.join(uploadsDir, prefix, galleryId, relativePath)
        if (fs.existsSync(localPath)) return next()

        const key = objectKeyForPrefix(prefix, galleryId, relativePath)

        try {
            const meta = await headObject(key)
            if (!meta) return next()

            const contentType =
                meta.contentType ||
                mimeForMediaFilename(relativePath) ||
                "application/octet-stream"
            res.setHeader("Content-Type", contentType)
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable")
            // DASH players need CORS-friendly segment fetches from the API origin.
            if (relativePath.endsWith(".mpd") || relativePath.endsWith(".m4s")) {
                res.setHeader("Access-Control-Allow-Origin", "*")
            }

            if (req.method === "HEAD") {
                res.setHeader("Content-Length", String(meta.contentLength))
                return res.status(200).end()
            }

            const stream = await getObjectStream(key)
            await pipeline(stream, res)
        } catch (err) {
            console.error("s3UploadsMiddleware:", err)
            next()
        }
    }
}
