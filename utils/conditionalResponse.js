import crypto from "crypto"

export const weakEtag = (payload) => {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload)
    const hash = crypto.createHash("sha1").update(body).digest("hex")
    return `W/"${hash}"`
}

export const matchesEtag = (req, etag) => {
    if (!etag) return false
    const header = req.headers["if-none-match"]
    if (!header) return false
    return String(header).split(",").map((v) => v.trim()).includes(etag)
}

export const sendJson = (req, res, statusCode, payload, options = {}) => {
    const { etag, cacheControl, extraHeaders = {} } = options

    if (etag) {
        res.setHeader("ETag", etag)
        if (matchesEtag(req, etag)) {
            if (cacheControl) res.setHeader("Cache-Control", cacheControl)
            for (const [key, value] of Object.entries(extraHeaders)) {
                res.setHeader(key, value)
            }
            return res.status(304).end()
        }
    }

    if (cacheControl) res.setHeader("Cache-Control", cacheControl)
    for (const [key, value] of Object.entries(extraHeaders)) {
        res.setHeader(key, value)
    }

    return res.status(statusCode).json(payload)
}

export const privateNoCache = "private, no-cache"
