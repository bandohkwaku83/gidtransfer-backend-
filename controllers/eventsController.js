import { computeOwnerRevision } from "../utils/syncRevision.js"
import { subscribeOwnerEvents } from "../utils/realtimeHub.js"

const HEARTBEAT_MS = Number(process.env.SSE_HEARTBEAT_MS ?? 25_000)

const writeSse = (res, event, data) => {
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
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
            res.write(": ping\n\n")
        }, HEARTBEAT_MS)

        req.on("close", () => {
            clearInterval(heartbeat)
            unsubscribe()
        })
    } catch (error) {
        console.error("streamOwnerEvents:", error)
        if (!res.headersSent) {
            return res.status(500).json({ message: "Server error" })
        }
        res.end()
    }
}
