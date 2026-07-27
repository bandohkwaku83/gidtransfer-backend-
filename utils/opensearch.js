import { Client } from "@opensearch-project/opensearch"

const PHOTO_INDEX = () =>
    process.env.OPENSEARCH_PHOTO_INDEX?.trim() || "photo_global_photos"
const GALLERY_INDEX = () =>
    process.env.OPENSEARCH_GALLERY_INDEX?.trim() || "photo_global_galleries"
const CLIENT_INDEX = () =>
    process.env.OPENSEARCH_CLIENT_INDEX?.trim() || "photo_global_clients"

let client = null
let initPromise = null
let lastInitError = null

export const opensearchEnabled = () => {
    const raw = process.env.OPENSEARCH_ENABLED?.trim().toLowerCase()
    if (raw === "false" || raw === "0" || raw === "off") return false
    if (raw === "true" || raw === "1" || raw === "on") return true
    return Boolean(process.env.OPENSEARCH_NODE?.trim())
}

export const opensearchPhotoIndex = PHOTO_INDEX
export const opensearchGalleryIndex = GALLERY_INDEX
export const opensearchClientIndex = CLIENT_INDEX

export const getOpensearchClient = () => {
    if (!opensearchEnabled()) return null
    if (client) return client

    const node = process.env.OPENSEARCH_NODE?.trim()
    if (!node) return null

    const username = process.env.OPENSEARCH_USERNAME?.trim()
    const password = process.env.OPENSEARCH_PASSWORD ?? ""
    const rejectUnauthorized =
        process.env.OPENSEARCH_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !==
        "false"

    client = new Client({
        node,
        ...(username
            ? {
                  auth: { username, password },
                  ssl: { rejectUnauthorized },
              }
            : {}),
    })
    return client
}

const photoMappings = {
    properties: {
        galleryId: { type: "keyword" },
        ownerId: { type: "keyword" },
        originalFilename: {
            type: "text",
            fields: { keyword: { type: "keyword", ignore_above: 256 } },
        },
        mimeType: { type: "keyword" },
        isVideo: { type: "boolean" },
        deleted: { type: "boolean" },
        setId: { type: "keyword" },
        sortOrder: { type: "integer" },
        selectedByClient: { type: "boolean" },
        rejectedByClient: { type: "boolean" },
        aiStatus: { type: "keyword" },
        qualityScore: { type: "integer" },
        faceCount: { type: "integer" },
        eyesOpen: { type: "boolean" },
        isBlurry: { type: "boolean" },
        sceneLabel: { type: "keyword" },
        tags: { type: "keyword" },
        issues: { type: "keyword" },
        suggested: { type: "boolean" },
        suggestionScore: { type: "integer" },
        suggestionReason: { type: "text" },
        duplicateGroupId: { type: "keyword" },
        isBestInGroup: { type: "boolean" },
        updatedAt: { type: "date" },
    },
}

const galleryMappings = {
    properties: {
        ownerId: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        description: { type: "text" },
        galleryType: { type: "keyword" },
        status: { type: "keyword" },
        slug: { type: "keyword" },
        clientName: { type: "text", fields: { keyword: { type: "keyword" } } },
        clientEmail: { type: "keyword" },
        deleted: { type: "boolean" },
        eventDate: { type: "date" },
        updatedAt: { type: "date" },
    },
}

const clientMappings = {
    properties: {
        ownerId: { type: "keyword" },
        name: { type: "text", fields: { keyword: { type: "keyword" } } },
        email: { type: "keyword" },
        phone: { type: "keyword" },
        location: { type: "text" },
        updatedAt: { type: "date" },
    },
}

/** Normalize client responses across opensearch-js shapes. */
export const opensearchBody = (res) => res?.body ?? res

const indexExists = (exists) => {
    const body = opensearchBody(exists)
    return body === true || body?.body === true
}

const ensureIndex = async (os, index, mappings) => {
    const exists = await os.indices.exists({ index })
    if (indexExists(exists)) return
    await os.indices.create({
        index,
        body: {
            settings: {
                number_of_shards: 1,
                number_of_replicas: 0,
            },
            mappings,
        },
    })
}

/** Create indices if missing. Safe to call on every boot when enabled. */
export const initOpensearch = async () => {
    if (!opensearchEnabled()) return { enabled: false }
    if (initPromise) return initPromise

    initPromise = (async () => {
        const os = getOpensearchClient()
        if (!os) {
            lastInitError = "OPENSEARCH_NODE is not set"
            return { enabled: false, error: lastInitError }
        }
        try {
            await os.ping()
            await ensureIndex(os, PHOTO_INDEX(), photoMappings)
            await ensureIndex(os, GALLERY_INDEX(), galleryMappings)
            await ensureIndex(os, CLIENT_INDEX(), clientMappings)
            lastInitError = null
            return { enabled: true }
        } catch (err) {
            lastInitError = err?.message ?? String(err)
            console.warn(`[opensearch] init failed: ${lastInitError}`)
            return { enabled: false, error: lastInitError }
        }
    })()

    return initPromise
}

export const opensearchReady = async () => {
    if (!opensearchEnabled()) return false
    const result = await initOpensearch()
    return result.enabled === true
}

export const getOpensearchInitError = () => lastInitError

/** Fire-and-forget helper — never throws to callers. */
export const opensearchSafe = (label, fn) => {
    if (!opensearchEnabled()) return
    void (async () => {
        try {
            if (!(await opensearchReady())) return
            await fn()
        } catch (err) {
            console.warn(
                `[opensearch] ${label}:`,
                err?.message ?? String(err)
            )
        }
    })()
}
