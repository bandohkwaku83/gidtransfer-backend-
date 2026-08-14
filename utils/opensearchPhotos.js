import GalleryPhoto from "../models/GalleryPhoto.js"
import {
    getOpensearchClient,
    opensearchBody,
    opensearchPhotoIndex,
    opensearchReady,
    opensearchSafe,
} from "./opensearch.js"

const idOf = (value) => {
    if (value == null) return null
    if (typeof value === "object" && value._id != null) return String(value._id)
    return String(value)
}

export const galleryPhotoToOpensearchDoc = (photo) => {
    const p = photo?.toObject?.() ?? photo
    const ai = p.aiAnalysis ?? {}
    return {
        galleryId: idOf(p.gallery),
        ownerId: idOf(p.owner),
        originalFilename: p.originalFilename ?? "",
        mimeType: p.mimeType ?? "",
        isVideo: p.isVideo === true,
        deleted: p.deletedAt != null,
        setId: p.set ? idOf(p.set) : null,
        sortOrder: typeof p.sortOrder === "number" ? p.sortOrder : 0,
        selectedByClient: p.selectedByClient === true,
        rejectedByClient: p.rejectedByClient === true,
        aiStatus: ai.status ?? null,
        qualityScore:
            typeof ai.qualityScore === "number" ? ai.qualityScore : null,
        faceCount: typeof ai.faceCount === "number" ? ai.faceCount : null,
        eyesOpen:
            ai.eyesOpen === null || ai.eyesOpen === undefined
                ? null
                : Boolean(ai.eyesOpen),
        isBlurry: ai.isBlurry === true,
        sceneLabel: ai.sceneLabel ?? null,
        tags: Array.isArray(ai.tags) ? ai.tags : [],
        issues: Array.isArray(ai.issues) ? ai.issues : [],
        suggested: ai.suggested === true,
        suggestionScore:
            typeof ai.suggestionScore === "number" ? ai.suggestionScore : null,
        suggestionReason: ai.suggestionReason ?? null,
        duplicateGroupId: ai.duplicateGroupId ?? null,
        isBestInGroup: ai.isBestInGroup !== false,
        updatedAt: p.updatedAt ?? new Date(),
    }
}

export const indexGalleryPhoto = async (photo) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const p = photo?.toObject?.() ?? photo
    const id = idOf(p._id ?? p.id)
    if (!id) return
    await os.index({
        index: opensearchPhotoIndex(),
        id,
        body: galleryPhotoToOpensearchDoc(photo),
        refresh: false,
    })
}

export const deleteGalleryPhotoFromOpensearch = async (photoId) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const id = idOf(photoId)
    if (!id) return
    try {
        await os.delete({
            index: opensearchPhotoIndex(),
            id,
            refresh: false,
        })
    } catch (err) {
        if (err?.meta?.statusCode === 404) return
        throw err
    }
}

export const deleteGalleryPhotosFromOpensearchByGallery = async (galleryId) => {
    if (!(await opensearchReady())) return
    const os = getOpensearchClient()
    const gid = idOf(galleryId)
    if (!gid) return
    await os.deleteByQuery({
        index: opensearchPhotoIndex(),
        body: {
            query: { term: { galleryId: gid } },
        },
        refresh: true,
        conflicts: "proceed",
    })
}

export const bulkIndexGalleryPhotos = async (photos) => {
    if (!(await opensearchReady()) || !photos?.length) return
    const os = getOpensearchClient()
    const index = opensearchPhotoIndex()
    const body = []
    for (const photo of photos) {
        const p = photo?.toObject?.() ?? photo
        const id = idOf(p._id ?? p.id)
        if (!id) continue
        body.push({ index: { _index: index, _id: id } })
        body.push(galleryPhotoToOpensearchDoc(photo))
    }
    if (body.length === 0) return
    await os.bulk({ refresh: false, body })
}

export const reindexGalleryPhotosForGallery = async (galleryId) => {
    if (!(await opensearchReady())) return 0
    const photos = await GalleryPhoto.find({ gallery: galleryId }).exec()
    if (photos.length === 0) {
        await deleteGalleryPhotosFromOpensearchByGallery(galleryId)
        return 0
    }
    await bulkIndexGalleryPhotos(photos)
    return photos.length
}

export const reindexAllGalleryPhotos = async () => {
    if (!(await opensearchReady())) return 0
    const cursor = GalleryPhoto.find({}).cursor()
    const batch = []
    let count = 0

    const flush = async () => {
        if (!batch.length) return
        await bulkIndexGalleryPhotos(batch)
        count += batch.length
        batch.length = 0
    }

    for await (const photo of cursor) {
        batch.push(photo)
        if (batch.length >= 200) await flush()
    }
    await flush()
    return count
}

export const scheduleGalleryPhotoIndex = (photo) =>
    opensearchSafe("index photo", () => indexGalleryPhoto(photo))

export const scheduleGalleryPhotoDelete = (photoId) =>
    opensearchSafe("delete photo", () =>
        deleteGalleryPhotoFromOpensearch(photoId)
    )

export const scheduleGalleryPhotosReindex = (galleryId) =>
    opensearchSafe("reindex gallery photos", () =>
        reindexGalleryPhotosForGallery(galleryId)
    )

const parseBool = (value) => {
    if (value === undefined || value === null || value === "") return undefined
    const s = String(value).trim().toLowerCase()
    if (["1", "true", "yes", "on"].includes(s)) return true
    if (["0", "false", "no", "off"].includes(s)) return false
    return undefined
}

const parseIntOrUndef = (value) => {
    if (value === undefined || value === null || value === "") return undefined
    const n = Number(value)
    return Number.isFinite(n) ? Math.round(n) : undefined
}

/** Normalize query params used by studio + public photo search. */
export const parseGalleryPhotoSearchParams = (query = {}) => {
    const q = String(query.q ?? query.search ?? "").trim()
    const scene = String(query.scene ?? query.sceneLabel ?? "")
        .trim()
        .toLowerCase()
    const tagRaw = query.tag ?? query.tags
    const tags = Array.isArray(tagRaw)
        ? tagRaw.map((t) => String(t).trim()).filter(Boolean)
        : String(tagRaw ?? "")
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)

    const params = {
        q: q || undefined,
        scene: scene || undefined,
        tags: tags.length ? tags : undefined,
        suggested: parseBool(query.suggested),
        isBlurry: parseBool(query.blurry ?? query.isBlurry),
        eyesOpen: parseBool(query.eyesOpen),
        selectedByClient: parseBool(query.selected ?? query.selectedByClient),
        rejectedByClient: parseBool(query.rejected ?? query.rejectedByClient),
        isVideo: parseBool(query.video ?? query.isVideo),
        minQuality: parseIntOrUndef(query.minQuality ?? query.min_quality),
        maxQuality: parseIntOrUndef(query.maxQuality ?? query.max_quality),
        setId:
            query.setId != null || query.set_id != null
                ? String(query.setId ?? query.set_id).trim() || undefined
                : undefined,
        includeTrash:
            String(query.trash) === "1" ||
            String(query.trash || "").toLowerCase() === "true",
    }

    // Prefer explicit mediaType=photo|video over video=true/false when both present.
    const mediaType = String(
        query.mediaType ?? query.kind ?? query.type ?? ""
    )
        .trim()
        .toLowerCase()
    if (mediaType === "photo" || mediaType === "photos" || mediaType === "image") {
        params.isVideo = false
    } else if (mediaType === "video" || mediaType === "videos") {
        params.isVideo = true
    }

    return params
}

export const galleryPhotoSearchHasCriteria = (params) => {
    if (!params) return false
    return Boolean(
        params.q ||
            params.scene ||
            params.tags?.length ||
            params.suggested !== undefined ||
            params.isBlurry !== undefined ||
            params.eyesOpen !== undefined ||
            params.selectedByClient !== undefined ||
            params.rejectedByClient !== undefined ||
            params.isVideo !== undefined ||
            params.minQuality !== undefined ||
            params.maxQuality !== undefined ||
            params.setId
    )
}

const buildPhotoSearchQuery = (galleryId, params) => {
    const filter = [{ term: { galleryId: String(galleryId) } }]

    if (!params.includeTrash) {
        filter.push({ term: { deleted: false } })
    }
    if (params.scene) filter.push({ term: { sceneLabel: params.scene } })
    if (params.tags?.length) {
        filter.push({ terms: { tags: params.tags } })
    }
    if (params.suggested !== undefined) {
        filter.push({ term: { suggested: params.suggested } })
    }
    if (params.isBlurry !== undefined) {
        filter.push({ term: { isBlurry: params.isBlurry } })
    }
    if (params.eyesOpen !== undefined) {
        filter.push({ term: { eyesOpen: params.eyesOpen } })
    }
    if (params.selectedByClient !== undefined) {
        filter.push({ term: { selectedByClient: params.selectedByClient } })
    }
    if (params.rejectedByClient !== undefined) {
        filter.push({ term: { rejectedByClient: params.rejectedByClient } })
    }
    if (params.isVideo !== undefined) {
        filter.push({ term: { isVideo: params.isVideo } })
    }
    if (params.setId) {
        filter.push({ term: { setId: params.setId } })
    }
    if (params.minQuality !== undefined || params.maxQuality !== undefined) {
        const range = {}
        if (params.minQuality !== undefined) range.gte = params.minQuality
        if (params.maxQuality !== undefined) range.lte = params.maxQuality
        filter.push({ range: { qualityScore: range } })
    }

    const must = []
    if (params.q) {
        must.push({
            multi_match: {
                query: params.q,
                type: "best_fields",
                fuzziness: "AUTO",
                fields: [
                    "originalFilename^3",
                    "tags^2",
                    "sceneLabel^2",
                    "suggestionReason",
                    "issues",
                ],
            },
        })
    }

    return {
        bool: {
            filter,
            ...(must.length ? { must } : { must: [{ match_all: {} }] }),
        },
    }
}

/**
 * Search photo IDs in OpenSearch. Returns null when OS is unavailable
 * so callers can fall back to Mongo.
 */
export const searchGalleryPhotoIds = async (
    galleryId,
    params,
    { from = 0, size = 50 } = {}
) => {
    if (!(await opensearchReady())) return null
    const os = getOpensearchClient()
    const body = {
        query: buildPhotoSearchQuery(galleryId, params),
        from,
        size,
        sort: params.q
            ? [{ _score: "desc" }, { sortOrder: "asc" }]
            : [{ sortOrder: "asc" }, { updatedAt: "desc" }],
        _source: false,
    }

    const res = await os.search({
        index: opensearchPhotoIndex(),
        body,
    })

    const payload = opensearchBody(res)
    const hits = payload?.hits?.hits ?? []
    const total =
        typeof payload?.hits?.total === "object"
            ? payload.hits.total.value
            : Number(payload?.hits?.total ?? hits.length)

    return {
        ids: hits.map((h) => h._id),
        total,
        engine: "opensearch",
    }
}

/** Mongo fallback for photo search when OpenSearch is off or fails. */
export const searchGalleryPhotoIdsMongo = async (
    galleryId,
    params,
    { skip = 0, limit = 50 } = {}
) => {
    const filter = { gallery: galleryId }
    if (!params.includeTrash) filter.deletedAt = null
    if (params.scene) filter["aiAnalysis.sceneLabel"] = params.scene
    if (params.tags?.length) filter["aiAnalysis.tags"] = { $all: params.tags }
    if (params.suggested !== undefined) {
        filter["aiAnalysis.suggested"] = params.suggested
    }
    if (params.isBlurry !== undefined) {
        filter["aiAnalysis.isBlurry"] = params.isBlurry
    }
    if (params.eyesOpen !== undefined) {
        filter["aiAnalysis.eyesOpen"] = params.eyesOpen
    }
    if (params.selectedByClient !== undefined) {
        filter.selectedByClient = params.selectedByClient
    }
    if (params.rejectedByClient !== undefined) {
        filter.rejectedByClient = params.rejectedByClient
    }
    if (params.isVideo !== undefined) filter.isVideo = params.isVideo
    if (params.setId) filter.set = params.setId
    if (params.minQuality !== undefined || params.maxQuality !== undefined) {
        filter["aiAnalysis.qualityScore"] = {}
        if (params.minQuality !== undefined) {
            filter["aiAnalysis.qualityScore"].$gte = params.minQuality
        }
        if (params.maxQuality !== undefined) {
            filter["aiAnalysis.qualityScore"].$lte = params.maxQuality
        }
    }
    if (params.q) {
        const escaped = params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp(escaped, "i")
        filter.$or = [
            { originalFilename: regex },
            { "aiAnalysis.tags": regex },
            { "aiAnalysis.sceneLabel": regex },
            { "aiAnalysis.suggestionReason": regex },
            { "aiAnalysis.issues": regex },
        ]
    }

    const [total, rows] = await Promise.all([
        GalleryPhoto.countDocuments(filter),
        GalleryPhoto.find(filter)
            .sort({ sortOrder: 1, createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .select("_id")
            .lean()
            .exec(),
    ])

    return {
        ids: rows.map((r) => String(r._id)),
        total,
        engine: "mongo",
    }
}

export const searchGalleryPhotos = async (
    galleryId,
    rawQuery,
    pagination = { skip: 0, limit: 50 }
) => {
    const params = parseGalleryPhotoSearchParams(rawQuery)
    try {
        const osHit = await searchGalleryPhotoIds(galleryId, params, {
            from: pagination.skip,
            size: pagination.limit,
        })
        if (osHit) return { ...osHit, params }
    } catch (err) {
        console.warn(
            "[opensearch] photo search failed, using mongo:",
            err?.message ?? err
        )
    }
    const mongoHit = await searchGalleryPhotoIdsMongo(galleryId, params, {
        skip: pagination.skip,
        limit: pagination.limit,
    })
    return { ...mongoHit, params }
}
