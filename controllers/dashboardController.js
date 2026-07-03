import Client from "../models/Client.js"
import { attachGalleryCounts } from "../utils/galleryFields.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import { getOwnerStorageBreakdown } from "../utils/storageUsage.js"
import { getPlanSummary } from "../utils/storageFields.js"
import {
    buildOwnerActivitySeries,
    buildWeeklyActivityMetrics,
    formatDashboardStats,
    formatDashboardStorage,
    loadRecentActivity,
    loadRecentGalleries,
} from "../utils/dashboardHelpers.js"

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
            getOwnerStorageBreakdown(ownerId),
            loadRecentGalleries(ownerId, recentLimit),
            loadRecentActivity(ownerId, recentLimit),
            buildWeeklyActivityMetrics(ownerId),
            buildOwnerActivitySeries(ownerId, activityDays),
        ])

        const plan = getPlanSummary(req.user)

        return res.status(200).json({
            stats: formatDashboardStats(clientCount, galleryCounts),
            storage: formatDashboardStorage(storageBreakdown, plan),
            weeklyActivity: {
                ...weeklyActivity,
                chart: activitySeries,
            },
            recentActivity,
            recentGalleries,
            user: formatUserResponse(req.user),
        })
    } catch (error) {
        console.error("Dashboard error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
