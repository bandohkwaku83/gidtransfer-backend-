import Gallery from "../models/Gallery.js"
import Client from "../models/Client.js"
import {
    getOpensearchClient,
    opensearchBody,
    opensearchClientIndex,
    opensearchGalleryIndex,
    opensearchReady,
    opensearchSafe,
} from "./opensearch.js"

const idOf = (value) => {
    if (value == null) return null
    if (typeof value === "object" && value._id != null) return String(value._id)
    return String(value)
}

export const galleryToOpensearchDoc = (gallery) => {
    const g = gallery?.toObject?.() ?? gallery
    const client = g.client && typeof g.client === "object" ? g.client : null
    return {
        ownerId: idOf(g.owner),
        name: g.name ?? "",
        description: g.description ?? "",
        galleryType: g.galleryType ?? null,
        status: g.status ?? null,
        slug: g.slug ?? null,
        clientName: client?.name ?? "",
        clientEmail: client?.email ?? "",
        deleted: g.deletedAt != null,
        eventDate: g.eventDate ?? null,
        updatedAt: g.updatedAt ?? new Date(),
    }
}

export const clientToOpensearchDoc = (client) => {
    const c = client?.toObject?.() ?? client
    return {
        ownerId: idOf(c.owner),
        name: c.name ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        location: c.location ?? "",
        updatedAt: c.updatedAt ?? new Date(),
    }
}

export const indexStudioGallery = async (gallery) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const g = gallery?.toObject?.() ?? gallery
    const id = idOf(g._id ?? g.id)
    if (!id) return

    let doc = galleryToOpensearchDoc(gallery)
    if (!doc.clientName && g.client) {
        const clientId = idOf(g.client)
        if (clientId) {
            const client = await Client.findById(clientId)
                .select("name email")
                .lean()
            if (client) {
                doc = {
                    ...doc,
                    clientName: client.name ?? "",
                    clientEmail: client.email ?? "",
                }
            }
        }
    }

    await os.index({
        index: opensearchGalleryIndex(),
        id,
        body: doc,
        refresh: false,
    })
}

export const deleteStudioGalleryFromOpensearch = async (galleryId) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const id = idOf(galleryId)
    if (!id) return
    try {
        await os.delete({
            index: opensearchGalleryIndex(),
            id,
            refresh: false,
        })
    } catch (err) {
        if (err?.meta?.statusCode === 404) return
        throw err
    }
}

export const indexStudioClient = async (client) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const c = client?.toObject?.() ?? client
    const id = idOf(c._id ?? c.id)
    if (!id) return
    await os.index({
        index: opensearchClientIndex(),
        id,
        body: clientToOpensearchDoc(client),
        refresh: false,
    })
}

export const deleteStudioClientFromOpensearch = async (clientId) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const id = idOf(clientId)
    if (!id) return
    try {
        await os.delete({
            index: opensearchClientIndex(),
            id,
            refresh: false,
        })
    } catch (err) {
        if (err?.meta?.statusCode === 404) return
        throw err
    }
}

export const scheduleStudioGalleryIndex = (gallery) =>
    opensearchSafe("index gallery", () => indexStudioGallery(gallery))

export const scheduleStudioGalleryDelete = (galleryId) =>
    opensearchSafe("delete gallery", () =>
        deleteStudioGalleryFromOpensearch(galleryId)
    )

export const scheduleStudioClientIndex = (client) =>
    opensearchSafe("index client", () => indexStudioClient(client))

export const scheduleStudioClientDelete = (clientId) =>
    opensearchSafe("delete client", () =>
        deleteStudioClientFromOpensearch(clientId)
    )

/**
 * Full-text studio gallery search. Returns null when OpenSearch is off.
 */
export const searchStudioGalleryIds = async (
    ownerId,
    search,
    { from = 0, size = 50, trashOnly = false, status } = {}
) => {
    if (!(await opensearchReady())) return null
    const q = String(search ?? "").trim()
    if (!q) return null

    const filter = [{ term: { ownerId: String(ownerId) } }]
    filter.push({ term: { deleted: trashOnly } })
    if (status && status !== "all") {
        filter.push({ term: { status } })
    }

    const os = getOpensearchClient()
    const res = await os.search({
        index: opensearchGalleryIndex(),
        body: {
            query: {
                bool: {
                    filter,
                    must: [
                        {
                            multi_match: {
                                query: q,
                                type: "best_fields",
                                fuzziness: "AUTO",
                                fields: [
                                    "name^3",
                                    "description",
                                    "clientName^2",
                                    "clientEmail",
                                    "galleryType",
                                    "slug",
                                ],
                            },
                        },
                    ],
                },
            },
            from,
            size,
            sort: [{ _score: "desc" }, { updatedAt: "desc" }],
            _source: false,
        },
    })

    const payload = opensearchBody(res)
    const hits = payload?.hits?.hits ?? []
    const total =
        typeof payload?.hits?.total === "object"
            ? payload.hits.total.value
            : Number(payload?.hits?.total ?? hits.length)

    return { ids: hits.map((h) => h._id), total, engine: "opensearch" }
}

export const searchStudioClientIds = async (
    ownerId,
    search,
    { from = 0, size = 50 } = {}
) => {
    if (!(await opensearchReady())) return null
    const q = String(search ?? "").trim()
    if (!q) return null

    const os = getOpensearchClient()
    const res = await os.search({
        index: opensearchClientIndex(),
        body: {
            query: {
                bool: {
                    filter: [{ term: { ownerId: String(ownerId) } }],
                    must: [
                        {
                            multi_match: {
                                query: q,
                                type: "best_fields",
                                fuzziness: "AUTO",
                                fields: [
                                    "name^3",
                                    "email^2",
                                    "phone",
                                    "location",
                                ],
                            },
                        },
                    ],
                },
            },
            from,
            size,
            sort: [{ _score: "desc" }, { updatedAt: "desc" }],
            _source: false,
        },
    })

    const payload = opensearchBody(res)
    const hits = payload?.hits?.hits ?? []
    const total =
        typeof payload?.hits?.total === "object"
            ? payload.hits.total.value
            : Number(payload?.hits?.total ?? hits.length)

    return { ids: hits.map((h) => h._id), total, engine: "opensearch" }
}

/** Hydrate Mongo docs preserving OpenSearch hit order. */
export const orderDocsByIds = (docs, ids) => {
    const map = new Map(docs.map((d) => [String(d._id), d]))
    return ids.map((id) => map.get(String(id))).filter(Boolean)
}

export const reindexAllStudioGalleries = async () => {
    if (!(await opensearchReady())) return 0
    const cursor = Gallery.find({})
        .populate({ path: "client", select: "name email" })
        .cursor()
    const batch = []
    let count = 0
    const os = getOpensearchClient()
    const index = opensearchGalleryIndex()

    const flush = async () => {
        if (!batch.length) return
        const body = []
        for (const gallery of batch) {
            body.push({ index: { _index: index, _id: String(gallery._id) } })
            body.push(galleryToOpensearchDoc(gallery))
        }
        await os.bulk({ refresh: false, body })
        count += batch.length
        batch.length = 0
    }

    for await (const gallery of cursor) {
        batch.push(gallery)
        if (batch.length >= 200) await flush()
    }
    await flush()
    return count
}

export const reindexAllStudioClients = async () => {
    if (!(await opensearchReady())) return 0
    const cursor = Client.find({}).cursor()
    const batch = []
    let count = 0
    const os = getOpensearchClient()
    const index = opensearchClientIndex()

    const flush = async () => {
        if (!batch.length) return
        const body = []
        for (const client of batch) {
            body.push({ index: { _index: index, _id: String(client._id) } })
            body.push(clientToOpensearchDoc(client))
        }
        await os.bulk({ refresh: false, body })
        count += batch.length
        batch.length = 0
    }

    for await (const client of cursor) {
        batch.push(client)
        if (batch.length >= 200) await flush()
    }
    await flush()
    return count
}
