import { computeOwnerRevision } from "./syncRevision.js"
import { privateNoCache, sendJson, weakEtag } from "./conditionalResponse.js"
import { pickFields, parseFieldsQuery } from "./sparseFields.js"

export const ownerSyncHeaders = (revision) => ({
    "X-Sync-Revision": revision,
    "X-API-Latency-Budget-Ms": String(process.env.SLOW_REQUEST_MS ?? 200),
})

export const sendOwnerJson = async (
    req,
    res,
    ownerId,
    payload,
    { etagSeed = {}, cacheControl = privateNoCache } = {}
) => {
    const revision = await computeOwnerRevision(ownerId)
    const body = {
        revision,
        serverTime: new Date().toISOString(),
        ...payload,
    }

    const fields = parseFieldsQuery(req.query)
    const responseBody = fields ? pickFields(body, fields) : body
    const etag = weakEtag({ revision, ...etagSeed, ...payload.pagination })

    return sendJson(req, res, 200, responseBody, {
        etag,
        cacheControl,
        extraHeaders: ownerSyncHeaders(revision),
    })
}
