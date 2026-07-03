import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GalleryAnalyticsEvent from "../models/GalleryAnalyticsEvent.js"
import { attachGalleryStats } from "./galleryDetailHelpers.js"

const ACTIVITY_DAY_COUNT = 7
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function startOfDay(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
}

function endOfDay(date) {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d
}

function dateKey(date) {
    return startOfDay(date).toISOString().slice(0, 10)
}

function buildDayBuckets() {
    const today = startOfDay(new Date())
    const buckets = []

    for (let offset = ACTIVITY_DAY_COUNT - 1; offset >= 0; offset -= 1) {
        const day = new Date(today)
        day.setDate(today.getDate() - offset)
        buckets.push({
            date: dateKey(day),
            label: WEEKDAY_LABELS[day.getDay()],
            selections: 0,
            galleryEvents: 0,
            total: 0,
        })
    }

    return buckets
}

function applyCountsToBuckets(buckets, rows, field) {
    const byDate = new Map(buckets.map((b) => [b.date, b]))
    for (const row of rows) {
        const bucket = byDate.get(row._id)
        if (!bucket) continue
        bucket[field] += row.count
        bucket.total += row.count
    }
}

async function aggregateDailyCounts(model, galleryId, dateField, rangeStart) {
    return model.aggregate([
        {
            $match: {
                gallery: galleryId,
                deletedAt: null,
                [dateField]: { $gte: rangeStart },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` },
                },
                count: { $sum: 1 },
            },
        },
    ])
}

async function aggregateTrackedDailyCounts(galleryId, rangeStart) {
    return GalleryAnalyticsEvent.aggregate([
        {
            $match: {
                gallery: galleryId,
                occurredAt: { $gte: rangeStart },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$occurredAt" },
                },
                count: { $sum: 1 },
            },
        },
    ])
}

async function buildActivitySeries(galleryId) {
    const rangeStart = startOfDay(new Date())
    rangeStart.setDate(rangeStart.getDate() - (ACTIVITY_DAY_COUNT - 1))

    const [selectionRows, uploadRows, finalRows, trackedRows] = await Promise.all([
        aggregateDailyCounts(GalleryPhoto, galleryId, "selectedAt", rangeStart),
        aggregateDailyCounts(GalleryPhoto, galleryId, "createdAt", rangeStart),
        aggregateDailyCounts(GalleryFinal, galleryId, "createdAt", rangeStart),
        aggregateTrackedDailyCounts(galleryId, rangeStart),
    ])

    const buckets = buildDayBuckets()
    applyCountsToBuckets(buckets, selectionRows, "selections")

    const galleryEventRows = [
        ...uploadRows,
        ...finalRows,
        ...trackedRows,
    ].reduce((acc, row) => {
        const existing = acc.get(row._id)
        if (existing) {
            existing.count += row.count
        } else {
            acc.set(row._id, { _id: row._id, count: row.count })
        }
        return acc
    }, new Map())

    applyCountsToBuckets(buckets, [...galleryEventRows.values()], "galleryEvents")

    return {
        days: ACTIVITY_DAY_COUNT,
        series: buckets,
    }
}

/** Record a client-facing analytics event without blocking the caller. */
export function recordGalleryAnalyticsEvent(galleryId, type, { finalId = null } = {}) {
    if (!galleryId || !type) return

    GalleryAnalyticsEvent.create({
        gallery: galleryId,
        type,
        occurredAt: new Date(),
        finalId: finalId ?? null,
    }).catch((error) => {
        console.error("recordGalleryAnalyticsEvent:", error.message)
    })
}

export async function buildGalleryAnalytics(galleryId) {
    const stats = await attachGalleryStats(galleryId)
    const { uploadCount, selectionCount, finalCount } = stats

    const [linkViews, clientDownloads, activity] = await Promise.all([
        GalleryAnalyticsEvent.countDocuments({
            gallery: galleryId,
            type: "link_view",
        }),
        GalleryAnalyticsEvent.countDocuments({
            gallery: galleryId,
            type: "client_download",
        }),
        buildActivitySeries(galleryId),
    ])

    const selectionRate =
        uploadCount > 0 ? Math.round((selectionCount / uploadCount) * 100) : 0

    return {
        linkViews,
        clientDownloads,
        clientPicks: selectionCount,
        selectionRate,
        mediaBreakdown: {
            uploads: uploadCount,
            selections: selectionCount,
            finals: finalCount,
            total: uploadCount + selectionCount + finalCount,
        },
        activity,
        range: {
            from: startOfDay(new Date(Date.now() - (ACTIVITY_DAY_COUNT - 1) * 86400000)),
            to: endOfDay(new Date()),
        },
    }
}
