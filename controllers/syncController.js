import Gallery from "../models/Gallery.js"
import Client from "../models/Client.js"
import Booking from "../models/Booking.js"
import {
    attachGalleryCounts,
    buildGalleryListFilter,
    formatGallerySummaryResponse,
    galleryOwnerFilter,
} from "../utils/galleryFields.js"
import {
    clientOwnerFilter,
    formatClientSummary,
    GALLERY_CLIENT_POPULATE,
} from "../utils/clientFields.js"
import {
    bookingOwnerFilter,
    formatBookingSummary,
} from "../utils/bookingFields.js"
import {
    buildChangedSinceFilter,
    parseSinceQuery,
} from "../utils/incrementalSync.js"
import {
    privateNoCache,
    sendJson,
    weakEtag,
} from "../utils/conditionalResponse.js"
import { computeOwnerRevision } from "../utils/syncRevision.js"
import { pickFields, parseFieldsQuery } from "../utils/sparseFields.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import {
    formatDashboardStats,
    formatDashboardStorage,
    buildWeeklyActivityMetrics,
    loadRecentGalleries,
} from "../utils/dashboardHelpers.js"
import { getOwnerStorageBreakdown } from "../utils/storageUsage.js"
import { getPlanSummary } from "../utils/storageFields.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"

const ALLOWED_BATCH_KEYS = new Set([
    "revision",
    "counts",
    "galleries",
    "clients",
    "bookings",
    "dashboard",
    "user",
])

const syncHeaders = (revision) => ({
    "X-Sync-Revision": revision,
    "X-API-Latency-Budget-Ms": String(process.env.SLOW_REQUEST_MS ?? 200),
})

export const getSyncRevision = async (req, res) => {
    try {
        const revision = await computeOwnerRevision(req.user._id)
        const payload = {
            revision,
            serverTime: new Date().toISOString(),
        }
        const etag = weakEtag(payload)
        return sendJson(req, res, 200, payload, {
            etag,
            cacheControl: "private, max-age=5",
            extraHeaders: syncHeaders(revision),
        })
    } catch (error) {
        console.error("getSyncRevision:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getSyncChanges = async (req, res) => {
    try {
        const sinceParsed = parseSinceQuery(req.query)
        if (sinceParsed?.error) {
            return res.status(400).json({ message: sinceParsed.error })
        }
        if (!sinceParsed?.since) {
            return res.status(400).json({
                message: "since is required (ISO 8601 timestamp)",
            })
        }

        const ownerId = req.user._id
        const since = sinceParsed.since
        const changedFilter = buildChangedSinceFilter(since)
        const ownerFilter = galleryOwnerFilter(ownerId)
        const changeLimit = Number(process.env.SYNC_CHANGES_LIMIT ?? 200)

        const [galleries, clients, bookings, revision, counts] = await Promise.all([
            Gallery.find({ ...ownerFilter, ...changedFilter })
                .populate(GALLERY_CLIENT_POPULATE)
                .sort({ updatedAt: -1 })
                .limit(changeLimit),
            Client.find({ ...clientOwnerFilter(ownerId), ...changedFilter })
                .sort({ updatedAt: -1 })
                .limit(changeLimit),
            Booking.find({ ...bookingOwnerFilter(ownerId), ...changedFilter })
                .populate({ path: "client", select: "name email phone" })
                .sort({ updatedAt: -1 })
                .limit(changeLimit),
            computeOwnerRevision(ownerId),
            attachGalleryCounts(ownerId),
        ])

        const payload = {
            revision,
            serverTime: new Date().toISOString(),
            since: since.toISOString(),
            counts,
            changes: {
                galleries: galleries.map(formatGallerySummaryResponse),
                clients: clients.map(formatClientSummary),
                bookings: bookings.map(formatBookingSummary),
            },
        }

        const fields = parseFieldsQuery(req.query)
        const responseBody = fields ? pickFields(payload, fields) : payload
        const etag = weakEtag({ revision, since: since.toISOString(), counts })

        return sendJson(req, res, 200, responseBody, {
            etag,
            cacheControl: privateNoCache,
            extraHeaders: syncHeaders(revision),
        })
    } catch (error) {
        console.error("getSyncChanges:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const postSyncBatch = async (req, res) => {
    try {
        const ownerId = req.user._id
        const includeRaw = req.body?.include ?? req.body?.resources
        const include = Array.isArray(includeRaw)
            ? includeRaw.map((key) => String(key).trim()).filter(Boolean)
            : ["revision", "counts", "galleries", "clients"]

        const unknown = include.filter((key) => !ALLOWED_BATCH_KEYS.has(key))
        if (unknown.length) {
            return res.status(400).json({
                message: `Unknown batch keys: ${unknown.join(", ")}`,
                allowed: [...ALLOWED_BATCH_KEYS],
            })
        }

        const revision = await computeOwnerRevision(ownerId)
        const result = { revision, serverTime: new Date().toISOString() }
        const tasks = []

        if (include.includes("counts")) {
            tasks.push(
                attachGalleryCounts(ownerId).then((counts) => {
                    result.counts = counts
                })
            )
        }

        if (include.includes("galleries")) {
            const pagination = parsePagination(req.body?.galleries ?? {}, {
                defaultLimit: 20,
                maxLimit: 100,
            })
            const built = buildGalleryListFilter(ownerId, {
                status: req.body?.galleries?.status,
                search: req.body?.galleries?.search,
                trashOnly: false,
            })
            tasks.push(
                Promise.all([
                    Gallery.countDocuments(built.filter),
                    paginatedQuery(
                        Gallery.find(built.filter)
                            .populate(GALLERY_CLIENT_POPULATE)
                            .sort({ updatedAt: -1 }),
                        pagination
                    ).exec(),
                ]).then(([total, rows]) => {
                    result.galleries = rows.map(formatGallerySummaryResponse)
                    result.galleriesPagination = buildPaginationMeta({
                        ...pagination,
                        total,
                    })
                })
            )
        }

        if (include.includes("clients")) {
            const pagination = parsePagination(req.body?.clients ?? {}, {
                defaultLimit: 50,
                maxLimit: 200,
            })
            const filter = clientOwnerFilter(ownerId)
            tasks.push(
                Promise.all([
                    Client.countDocuments(filter),
                    paginatedQuery(
                        Client.find(filter).sort({ createdAt: -1 }),
                        pagination
                    ).exec(),
                ]).then(([total, rows]) => {
                    result.clients = rows.map(formatClientSummary)
                    result.clientsPagination = buildPaginationMeta({
                        ...pagination,
                        total,
                    })
                })
            )
        }

        if (include.includes("bookings")) {
            const pagination = parsePagination(req.body?.bookings ?? {}, {
                defaultLimit: 50,
                maxLimit: 200,
            })
            const filter = bookingOwnerFilter(ownerId)
            tasks.push(
                Promise.all([
                    Booking.countDocuments(filter),
                    paginatedQuery(
                        Booking.find(filter)
                            .populate({ path: "client", select: "name email phone" })
                            .sort({ startsAt: 1 }),
                        pagination
                    ).exec(),
                ]).then(([total, rows]) => {
                    result.bookings = rows.map(formatBookingSummary)
                    result.bookingsPagination = buildPaginationMeta({
                        ...pagination,
                        total,
                    })
                })
            )
        }

        if (include.includes("dashboard")) {
            tasks.push(
                Promise.all([
                    Client.countDocuments({ owner: ownerId }),
                    attachGalleryCounts(ownerId),
                    getOwnerStorageBreakdown(ownerId),
                    loadRecentGalleries(ownerId, 5),
                    buildWeeklyActivityMetrics(ownerId),
                ]).then(
                    ([
                        clientCount,
                        galleryCounts,
                        storageBreakdown,
                        recentGalleries,
                        weeklyActivity,
                    ]) => {
                        const plan = getPlanSummary(req.user)
                        result.dashboard = {
                            stats: formatDashboardStats(clientCount, galleryCounts),
                            storage: formatDashboardStorage(storageBreakdown, plan),
                            weeklyActivity,
                            recentGalleries,
                        }
                    }
                )
            )
        }

        if (include.includes("user")) {
            result.user = formatUserResponse(req.user)
        }

        await Promise.all(tasks)

        const fields = parseFieldsQuery(req.body)
        const responseBody = fields ? pickFields(result, fields) : result
        const etag = weakEtag({ revision, include })

        return sendJson(req, res, 200, responseBody, {
            etag,
            cacheControl: privateNoCache,
            extraHeaders: syncHeaders(revision),
        })
    } catch (error) {
        console.error("postSyncBatch:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
