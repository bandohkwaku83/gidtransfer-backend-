import fs from "fs"
import os from "os"
import path from "path"
import sharp from "sharp"
import {
    ffmpegAvailable,
    listFilesRecursive,
    mimeForMediaFilename,
    runFfmpeg,
} from "./ffmpeg.js"
import {
    GALLERY_PHOTOS_DIR,
    galleryPhotoObjectKey,
    galleryPhotoStoragePath,
} from "./galleryPhotoStorage.js"
import {
    GALLERY_FINALS_DIR,
    galleryFinalObjectKey,
    galleryFinalStoragePath,
} from "./galleryFinalStorage.js"
import {
    s3Configured,
    getObjectStream,
    uploadBuffer,
    deleteObject,
    deleteObjectsByPrefix,
} from "./s3Storage.js"

const parseLadder = () => {
    // height:bitrateKbps pairs — lowest first for ABR.
    const raw =
        process.env.GALLERY_VIDEO_DASH_LADDER?.trim() ||
        "360:800,720:1800,1080:3500"
    const rungs = []
    for (const part of raw.split(",")) {
        const [h, b] = part.split(":").map((s) => Number(String(s).trim()))
        if (!Number.isFinite(h) || !Number.isFinite(b) || h < 144 || b < 100) {
            continue
        }
        rungs.push({ height: Math.floor(h), bitrateKbps: Math.floor(b) })
    }
    return rungs.length ? rungs : [{ height: 720, bitrateKbps: 1800 }]
}

const dashMaxSourceBytes = () => {
    const n = Number(process.env.GALLERY_VIDEO_DASH_MAX_BYTES)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    // Default 2 GiB — avoid encoding huge masters in-process.
    return 2 * 1024 * 1024 * 1024
}

const dashSegmentDuration = () => {
    const n = Number(process.env.GALLERY_VIDEO_DASH_SEG_DURATION)
    if (Number.isFinite(n) && n >= 1 && n <= 12) return Math.floor(n)
    return 4
}

const dashTimeoutMs = () => {
    const n = Number(process.env.GALLERY_VIDEO_DASH_TIMEOUT_MS)
    if (Number.isFinite(n) && n >= 60_000) return Math.floor(n)
    return 45 * 60_000
}

export const galleryVideoDashEnabled = () => {
    const raw = process.env.GALLERY_VIDEO_DASH_ENABLED?.trim()?.toLowerCase()
    if (raw === "false" || raw === "0" || raw === "off") return false
    return true
}

const dashDirName = (storedFilename) => {
    const base = path.parse(storedFilename).name
    return `${base}-dash`
}

export const dashManifestRelativePath = (storedFilename) =>
    `${dashDirName(storedFilename)}/manifest.mpd`

export const posterRelativePath = (storedFilename) => {
    const base = path.parse(storedFilename).name
    return `${base}-poster.jpg`
}

const storagePathsForKind = (kind) => {
    if (kind === "final") {
        return {
            localRoot: GALLERY_FINALS_DIR,
            objectKey: galleryFinalObjectKey,
            localFilePath: galleryFinalStoragePath,
        }
    }
    return {
        localRoot: GALLERY_PHOTOS_DIR,
        objectKey: galleryPhotoObjectKey,
        localFilePath: galleryPhotoStoragePath,
    }
}

const ensureTempDir = async (prefix) => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix))
    return dir
}

const downloadSourceToTemp = async ({ kind, galleryId, storedFilename, destPath }) => {
    const { objectKey, localFilePath } = storagePathsForKind(kind)

    if (s3Configured()) {
        const stream = await getObjectStream(objectKey(galleryId, storedFilename))
        await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
        const write = fs.createWriteStream(destPath)
        await new Promise((resolve, reject) => {
            stream.pipe(write)
            stream.on("error", reject)
            write.on("error", reject)
            write.on("finish", resolve)
        })
        return
    }

    const src = localFilePath(galleryId, storedFilename)
    if (!src || !fs.existsSync(src)) {
        throw new Error("Video source file not found")
    }
    await fs.promises.copyFile(src, destPath)
}

const writeStoredFile = async ({ kind, galleryId, relativePath, localPath }) => {
    const { objectKey, localRoot } = storagePathsForKind(kind)
    const mime = mimeForMediaFilename(relativePath)
    const body = await fs.promises.readFile(localPath)

    if (s3Configured()) {
        await uploadBuffer(objectKey(galleryId, relativePath), body, mime)
        return
    }

    const dest = path.join(localRoot, String(galleryId), relativePath)
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await fs.promises.writeFile(dest, body)
}

const removeStoredRelative = async ({ kind, galleryId, relativePath }) => {
    if (!relativePath) return
    const { objectKey, localRoot } = storagePathsForKind(kind)

    if (s3Configured()) {
        await deleteObject(objectKey(galleryId, relativePath))
        return
    }

    const full = path.join(localRoot, String(galleryId), relativePath)
    try {
        if (fs.existsSync(full)) {
            const stat = await fs.promises.stat(full)
            if (stat.isDirectory()) {
                await fs.promises.rm(full, { recursive: true, force: true })
            } else {
                await fs.promises.unlink(full)
            }
        }
    } catch {
        /* ignore */
    }
}

/**
 * After a local DASH encode, delete every uploaded/local segment under the dash dir.
 * For S3 we upload then delete by listing the local encode output paths.
 */
const publishDashDirectory = async ({
    kind,
    galleryId,
    dashRelDir,
    localDashDir,
}) => {
    const files = await listFilesRecursive(localDashDir)
    for (const rel of files) {
        const relativePath = `${dashRelDir}/${rel}`
        await writeStoredFile({
            kind,
            galleryId,
            relativePath,
            localPath: path.join(localDashDir, rel),
        })
    }
    return files
}

const removePublishedDashFiles = async ({
    kind,
    galleryId,
    dashRelDir,
    relativeFiles,
}) => {
    for (const rel of relativeFiles) {
        await removeStoredRelative({
            kind,
            galleryId,
            relativePath: `${dashRelDir}/${rel}`,
        })
    }
}

const buildDashArgs = ({ inputPath, outputDir, ladder, includeAudio }) => {
    const segDur = dashSegmentDuration()
    const args = ["-y", "-i", inputPath, "-hide_banner", "-loglevel", "error"]

    for (let i = 0; i < ladder.length; i += 1) {
        args.push("-map", "0:v:0")
        if (includeAudio) args.push("-map", "0:a:0")
    }

    for (let i = 0; i < ladder.length; i += 1) {
        const { height, bitrateKbps } = ladder[i]
        const gop = Math.max(24, segDur * 30)
        args.push(
            `-c:v:${i}`,
            "libx264",
            `-preset:v:${i}`,
            "veryfast",
            `-b:v:${i}`,
            `${bitrateKbps}k`,
            `-maxrate:v:${i}`,
            `${Math.round(bitrateKbps * 1.4)}k`,
            `-bufsize:v:${i}`,
            `${bitrateKbps * 2}k`,
            `-filter:v:${i}`,
            `scale=-2:${height}`,
            `-g:v:${i}`,
            String(gop),
            `-keyint_min:v:${i}`,
            String(gop),
            `-sc_threshold:v:${i}`,
            "0"
        )
        if (includeAudio) {
            args.push(`-c:a:${i}`, "aac", `-b:a:${i}`, "128k", `-ac:a:${i}`, "2")
        }
    }

    const adaptationSets = includeAudio
        ? "id=0,streams=v id=1,streams=a"
        : "id=0,streams=v"

    args.push(
        "-use_timeline",
        "1",
        "-use_template",
        "1",
        "-seg_duration",
        String(segDur),
        "-adaptation_sets",
        adaptationSets,
        "-f",
        "dash",
        path.join(outputDir, "manifest.mpd")
    )

    return args
}

const probeHasAudio = async (inputPath) => {
    try {
        await runFfmpeg(
            [
                "-i",
                inputPath,
                "-hide_banner",
                "-loglevel",
                "error",
                "-map",
                "0:a:0",
                "-frames:a",
                "0",
                "-f",
                "null",
                "-",
            ],
            { timeoutMs: 60_000 }
        )
        return true
    } catch {
        return false
    }
}

/**
 * Encode adaptive DASH + progressive JPEG poster for a gallery video.
 * @returns {{ dashManifestStoredFilename, posterStoredFilename, dashStatus, dashError? }}
 */
export async function generateGalleryVideoDash({
    kind = "photo",
    galleryId,
    storedFilename,
    sizeBytes = 0,
}) {
    if (!galleryVideoDashEnabled()) {
        return {
            dashManifestStoredFilename: null,
            posterStoredFilename: null,
            dashStatus: "skipped",
            dashError: null,
        }
    }

    if (!(await ffmpegAvailable())) {
        return {
            dashManifestStoredFilename: null,
            posterStoredFilename: null,
            dashStatus: "skipped",
            dashError: "ffmpeg not available",
        }
    }

    if (sizeBytes > dashMaxSourceBytes()) {
        return {
            dashManifestStoredFilename: null,
            posterStoredFilename: null,
            dashStatus: "skipped",
            dashError: `source exceeds GALLERY_VIDEO_DASH_MAX_BYTES (${dashMaxSourceBytes()})`,
        }
    }

    const tempRoot = await ensureTempDir("pg-dash-")
    const inputPath = path.join(tempRoot, `source${path.extname(storedFilename) || ".mp4"}`)
    const dashOutDir = path.join(tempRoot, "dash")
    const posterPath = path.join(tempRoot, "poster.jpg")
    const dashRelDir = dashDirName(storedFilename)
    const posterRel = posterRelativePath(storedFilename)
    let publishedFiles = []

    try {
        await fs.promises.mkdir(dashOutDir, { recursive: true })
        await downloadSourceToTemp({
            kind,
            galleryId,
            storedFilename,
            destPath: inputPath,
        })

        const ladder = parseLadder()
        const includeAudio = await probeHasAudio(inputPath)
        await runFfmpeg(
            buildDashArgs({
                inputPath,
                outputDir: dashOutDir,
                ladder,
                includeAudio,
            }),
            { timeoutMs: dashTimeoutMs() }
        )

        // Progressive JPEG poster for faster first paint before playback.
        await runFfmpeg(
            [
                "-y",
                "-ss",
                "1",
                "-i",
                inputPath,
                "-frames:v",
                "1",
                "-q:v",
                "3",
                "-vf",
                "scale='min(1280,iw)':-2",
                posterPath,
            ],
            { timeoutMs: 120_000 }
        )

        const progressivePoster = path.join(tempRoot, "poster-progressive.jpg")
        await sharp(posterPath)
            .jpeg({
                quality: 82,
                mozjpeg: true,
                progressive: true,
                chromaSubsampling: "4:2:0",
            })
            .toFile(progressivePoster)

        const posterFinal = fs.existsSync(progressivePoster)
            ? progressivePoster
            : posterPath

        publishedFiles = await publishDashDirectory({
            kind,
            galleryId,
            dashRelDir,
            localDashDir: dashOutDir,
        })

        await writeStoredFile({
            kind,
            galleryId,
            relativePath: posterRel,
            localPath: posterFinal,
        })

        return {
            dashManifestStoredFilename: `${dashRelDir}/manifest.mpd`,
            posterStoredFilename: posterRel,
            dashStatus: "ready",
            dashError: null,
        }
    } catch (err) {
        if (publishedFiles.length) {
            await removePublishedDashFiles({
                kind,
                galleryId,
                dashRelDir,
                relativeFiles: publishedFiles,
            }).catch(() => {})
        }
        await removeStoredRelative({
            kind,
            galleryId,
            relativePath: posterRel,
        }).catch(() => {})

        return {
            dashManifestStoredFilename: null,
            posterStoredFilename: null,
            dashStatus: "failed",
            dashError: err?.message?.slice(0, 500) || "DASH encode failed",
        }
    } finally {
        try {
            await fs.promises.rm(tempRoot, { recursive: true, force: true })
        } catch {
            /* ignore */
        }
    }
}

/**
 * Delete all DASH + poster assets for a video photo/final.
 */
export async function purgeGalleryVideoStreamingAssets({
    kind = "photo",
    galleryId,
    storedFilename,
    posterStoredFilename,
    dashManifestStoredFilename,
}) {
    if (!galleryId || !storedFilename) return

    const { objectKey, localRoot } = storagePathsForKind(kind)
    const poster = posterStoredFilename || posterRelativePath(storedFilename)
    const dashDir = dashManifestStoredFilename
        ? path.posix.dirname(dashManifestStoredFilename)
        : dashDirName(storedFilename)

    await removeStoredRelative({ kind, galleryId, relativePath: poster })

    if (!s3Configured()) {
        const dir = path.join(localRoot, String(galleryId), dashDir)
        try {
            if (fs.existsSync(dir)) {
                await fs.promises.rm(dir, { recursive: true, force: true })
            }
        } catch {
            /* ignore */
        }
        return
    }

    const prefix = objectKey(galleryId, dashDir)
    await deleteObjectsByPrefix(prefix)
}

/** Alias for callers that delete streaming companions with a photo/final row. */
export const deleteGalleryVideoStreamingAssets = purgeGalleryVideoStreamingAssets
