import { spawn } from "child_process"
import fs from "fs"
import path from "path"

let cachedBinary = undefined

/** Resolve ffmpeg binary: FFMPEG_PATH, then `ffmpeg` on PATH. */
export const resolveFfmpegPath = () => {
    if (cachedBinary !== undefined) return cachedBinary
    const fromEnv = process.env.FFMPEG_PATH?.trim()
    if (fromEnv) {
        cachedBinary = fromEnv
        return cachedBinary
    }
    cachedBinary = "ffmpeg"
    return cachedBinary
}

export const ffmpegAvailable = async () => {
    const bin = resolveFfmpegPath()
    return new Promise((resolve) => {
        const child = spawn(bin, ["-version"], {
            stdio: ["ignore", "ignore", "ignore"],
        })
        child.on("error", () => resolve(false))
        child.on("close", (code) => resolve(code === 0))
    })
}

/**
 * Run ffmpeg with args. Rejects on non-zero exit.
 * @param {string[]} args
 * @param {{ cwd?: string, timeoutMs?: number }} [opts]
 */
export const runFfmpeg = (args, { cwd, timeoutMs = 0 } = {}) =>
    new Promise((resolve, reject) => {
        const bin = resolveFfmpegPath()
        const child = spawn(bin, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        })

        let stderr = ""
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString()
            if (stderr.length > 32_000) {
                stderr = stderr.slice(-24_000)
            }
        })

        let timer = null
        if (timeoutMs > 0) {
            timer = setTimeout(() => {
                child.kill("SIGKILL")
                reject(new Error(`ffmpeg timed out after ${timeoutMs}ms`))
            }, timeoutMs)
        }

        child.on("error", (err) => {
            if (timer) clearTimeout(timer)
            reject(
                new Error(
                    `ffmpeg failed to start (${bin}): ${err.message}. Install FFmpeg or set FFMPEG_PATH.`
                )
            )
        })

        child.on("close", (code) => {
            if (timer) clearTimeout(timer)
            if (code === 0) {
                resolve({ stderr })
                return
            }
            reject(
                new Error(
                    `ffmpeg exited with code ${code}: ${stderr.trim().slice(-2000) || "no stderr"}`
                )
            )
        })
    })

/** Recursively list files under dir (relative paths use `/`). */
export const listFilesRecursive = async (dir, base = dir) => {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    const out = []
    for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            out.push(...(await listFilesRecursive(full, base)))
        } else if (entry.isFile()) {
            out.push(path.relative(base, full).split(path.sep).join("/"))
        }
    }
    return out
}

/** Guess Content-Type for DASH / media files. */
export const mimeForMediaFilename = (filename) => {
    const ext = path.extname(filename).toLowerCase()
    switch (ext) {
        case ".mpd":
            return "application/dash+xml"
        case ".m4s":
        case ".mp4":
            return "video/mp4"
        case ".m4a":
            return "audio/mp4"
        case ".jpg":
        case ".jpeg":
            return "image/jpeg"
        case ".webp":
            return "image/webp"
        case ".png":
            return "image/png"
        case ".webm":
            return "video/webm"
        default:
            return "application/octet-stream"
    }
}
