import { computeOwnerRevision } from "../utils/syncRevision.js"
import { subscribeOwnerEvents } from "../utils/realtimeHub.js"

const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS ?? 25_000)

const safeWrite = (res, chunk) => {
    try {
        if (res.writableEnded || res.destroyed) return false
        res.write(chunk)
        return true
    } catch {
        return false
    }
}

const writeSse = (res, event, data) => {
    if (!safeWrite(res, `event: ${event}\n`)) return
    safeWrite(res, `data: ${JSON.stringify(data)}\n\n`)
}

export const streamOwnerEvents = async (req, res) => {
    try {
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
        res.setHeader("Cache-Control", "no-cache, no-transform")
        res.setHeader("Connection", "keep-alive")
        res.setHeader("X-Accel-Buffering", "no")
        res.flushHeaders?.()

        const ownerId = req.user._id
        const revision = await computeOwnerRevision(ownerId)
        writeSse(res, "sync.ready", {
            revision,
            serverTime: new Date().toISOString(),
        })

        const unsubscribe = subscribeOwnerEvents(ownerId, (message) => {
            writeSse(res, message.event, message)
        })

        const heartbeat = setInterval(() => {
            safeWrite(res, ": ping\n\n")
        }, HEARTBEAT_MS)

        const cleanup = () => {
            clearInterval(heartbeat)
            unsubscribe()
        }

        req.on("close", cleanup)
        req.on("aborted", cleanup)
    } catch (error) {
        console.error("streamOwnerEvents:", error)
        if (!res.headersSent) {
            return res.status(500).json({ message: "Server error" })
        }
        res.end()
    }
}
