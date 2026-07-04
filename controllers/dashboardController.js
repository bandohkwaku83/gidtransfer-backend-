import Client from "../models/Client.js"
import { attachGalleryCounts } from "../utils/galleryFields.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import { getOwnerStorageBreakdown } from "../utils/storageUsage.js"
import { getPlanSummary } from "../utils/storageFields.js"
import { cacheGetOrSet } from "../utils/memoryCache.js"
import {
    buildOwnerActivitySeries,
    buildWeeklyActivityMetrics,
    formatDashboardStats,
    formatDashboardStorage,
    loadOwnerGalleryIds,
    loadRecentActivity,
    loadRecentGalleries,
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
            req.query.recentLimit ?? req.query.recent_limit
        )
        const activityDays = parseActivityDays(
            req.query.activityDays ?? req.query.activity_days
        )

        const cached = await cacheGetOrSet(
            dashboardCacheKey(ownerId, recentLimit, activityDays),
            async () => {
                const galleryIds = await loadOwnerGalleryIds(ownerId)

                const [
                    clientCount,
                    galleryCounts,
                    storageBreakdown,
                    recentGalleries,
                    recentActivity,
                    weeklyActivity,
                    activitySeries,
                ] = await Promise.all([
                    Client.countDocuments({ owner: ownerId }),
                    attachGalleryCounts(ownerId),
                    getOwnerStorageBreakdown(ownerId, galleryIds),
                    loadRecentGalleries(ownerId, recentLimit),
                    loadRecentActivity(ownerId, recentLimit),
                    buildWeeklyActivityMetrics(ownerId, galleryIds),
                    buildOwnerActivitySeries(ownerId, activityDays, galleryIds),
                ])

                const plan = getPlanSummary(req.user)

                return {
                    stats: formatDashboardStats(clientCount, galleryCounts),
                    storage: formatDashboardStorage(storageBreakdown, plan),
                    weeklyActivity: {
                        ...weeklyActivity,
                        chart: activitySeries,
                    },
                    recentActivity,
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
