import Client from "../models/Client.js"
import { attachGalleryCounts } from "../utils/galleryFields.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import { getOwnerStorageBreakdown } from "../utils/storageUsage.js"
import { getPlanSummary } from "../utils/storageFields.js"
import { getEffectiveVideoUploadLimitBytes } from "../utils/planCatalog.js"
import { cacheGetOrSet } from "../utils/memoryCache.js"
import {
    buildOwnerActivitySeries,
    buildWeeklyActivityMetrics,
    formatDashboardStats,
    formatDashboardStorage,
    loadCurrentSelections,
    loadNewClients,
    loadNewGalleries,
    loadOwnerGalleryIds,
    loadRecentActivity,
    loadRecentGalleries,
    loadUpcomingSchedules,
} from "../utils/dashboardHelpers.js"

const DASHBOARD_CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS ?? 60_000)

export const dashboardCacheKey = (ownerId, recentLimit, activityDays) =>
    `dashboard:${ownerId}:${recentLimit}:${activityDays}`

const parseLimit = (value, fallback = 10, max = 20) => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1) return fallback
    return Math.min(n, max)
}

const parseActivityDays = (value) => {
    const n = Number(value)
    if (!Number.isInteger(n) || n < 1) return 7
    return Math.min(n, 30)
}

export const getDashboard = async (req, res) => {
    try {
        const ownerId = req.user._id
        const recentLimit = parseLimit(
            req.query.recentLimit ?? req.query.recent_limit,
            10
        )
        const activityDays = parseActivityDays(
            req.query.activityDays ?? req.query.activity_days
        )
        const activityLimit = parseLimit(
            req.query.activityLimit ?? req.query.activity_limit,
            4,
            20
        )
        const clientsLimit = parseLimit(
            req.query.clientsLimit ?? req.query.clients_limit,
            4,
            20
        )
        const selectionsLimit = parseLimit(
            req.query.selectionsLimit ?? req.query.selections_limit,
            4,
            20
        )
        const galleriesLimit = parseLimit(
            req.query.galleriesLimit ?? req.query.galleries_limit,
            5,
            20
        )
        const schedulesLimit = parseLimit(
            req.query.schedulesLimit ?? req.query.schedules_limit,
            12,
            50
        )

        const cacheKey = `${dashboardCacheKey(ownerId, recentLimit, activityDays)}:${activityLimit}:${clientsLimit}:${selectionsLimit}:${galleriesLimit}:${schedulesLimit}`

        const cached = await cacheGetOrSet(
            cacheKey,
            async () => {
                const galleryIds = await loadOwnerGalleryIds(ownerId)

                const [
                    clientCount,
                    galleryCounts,
                    storageBreakdown,
                    recentGalleries,
                    recentActivity,
                    newClients,
                    currentSelections,
                    newGalleries,
                    schedules,
                    weeklyActivity,
                    activitySeries,
                ] = await Promise.all([
                    Client.countDocuments({ owner: ownerId }),
                    attachGalleryCounts(ownerId),
                    getOwnerStorageBreakdown(ownerId, galleryIds),
                    loadRecentGalleries(ownerId, recentLimit),
                    loadRecentActivity(ownerId, activityLimit),
                    loadNewClients(ownerId, clientsLimit),
                    loadCurrentSelections(ownerId, selectionsLimit),
                    loadNewGalleries(ownerId, galleriesLimit),
                    loadUpcomingSchedules(ownerId, schedulesLimit),
                    buildWeeklyActivityMetrics(ownerId, galleryIds),
                    buildOwnerActivitySeries(ownerId, activityDays, galleryIds),
                ])

                const plan = getPlanSummary(req.user)
                const videoLimitBytes = getEffectiveVideoUploadLimitBytes(req.user)

                return {
                    stats: formatDashboardStats(clientCount, galleryCounts),
                    storage: formatDashboardStorage(
                        storageBreakdown,
                        plan,
                        videoLimitBytes
                    ),
                    weeklyActivity: {
                        ...weeklyActivity,
                        chart: activitySeries,
                    },
                    /** Organizer sections */
                    recentActivity,
                    newClients,
                    currentSelections,
                    newGalleries,
                    schedules,
                    /** Legacy aliases kept for existing frontend */
                    recentGalleries,
                }
            },
            DASHBOARD_CACHE_TTL_MS
        )

        return res.status(200).json({
            ...cached,
            user: formatUserResponse(req.user),
        })
    } catch (error) {
        console.error("Dashboard error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
