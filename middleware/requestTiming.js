const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 200)

const routeLabel = (req) => {
    if (req.route?.path) {
        const base = req.baseUrl || ""
        return `${req.method} ${base}${req.route.path}`
    }
    return `${req.method} ${req.originalUrl?.split("?")[0] || req.path}`
}

export const requestTiming = (req, res, next) => {
    const start = process.hrtime.bigint()
    const originalEnd = res.end

    res.end = function requestTimingEnd(...args) {
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000

        if (!res.headersSent && process.env.REQUEST_TIMING_HEADER !== "0") {
            res.setHeader("Server-Timing", `total;dur=${elapsedMs.toFixed(1)}`)
        }

        if (elapsedMs >= SLOW_REQUEST_MS) {
            console.warn(
                `[perf] slow ${routeLabel(req)} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`
            )
        }

        return originalEnd.apply(this, args)
    }

    next()
}
