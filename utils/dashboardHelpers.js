import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GalleryAnalyticsEvent from "../models/GalleryAnalyticsEvent.js"
import Client from "../models/Client.js"
import Booking from "../models/Booking.js"
import {
    galleryNotDeletedFilter,
    galleryOwnerFilter,
} from "./galleryFields.js"
import {
    bookingOwnerFilter,
    formatBookingResponse,
    weekRangeLocal,
} from "./bookingFields.js"
import { formatClientEmbed } from "./clientFields.js"
import { resolveMediaUrl } from "./formatUserResponse.js"
import { formatBytesLabel } from "./storageFields.js"

const ACTIVITY_DAY_COUNT = 7
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const STATUS_ACTIVITY = {
    draft: { action: "draft", label: "Draft" },
    selecting: { action: "proofing", label: "Proofing" },
    done: { action: "delivered", label: "Delivered" },
}

const startOfDay = (date) => {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
}

const endOfDay = (date) => {
    const d = new Date(date)
    d.setHours(23, 59, 59, 999)
    return d
}

const dateKey = (date) => startOfDay(date).toISOString().slice(0, 10)

const buildDayBuckets = (dayCount = ACTIVITY_DAY_COUNT) => {
    const today = startOfDay(new Date())
    const buckets = []

    for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
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

const applyCountsToBuckets = (buckets, rows, field) => {
    const byDate = new Map(buckets.map((b) => [b.date, b]))
    for (const row of rows) {
        const bucket = byDate.get(row._id)
        if (!bucket) continue
        bucket[field] += row.count
        bucket.total += row.count
    }
}

const aggregateOwnerDailyCounts = async (
    model,
    galleryIds,
    dateField,
    rangeStart,
    extraMatch = {}
) => {
    if (!galleryIds.length) return []

    return model.aggregate([
        {
            $match: {
                gallery: { $in: galleryIds },
                deletedAt: null,
                [dateField]: { $gte: rangeStart },
                ...extraMatch,
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

const aggregateOwnerGalleryUpdates = async (ownerId, rangeStart) => {
    return Gallery.aggregate([
        {
            $match: {
                ...galleryOwnerFilter(ownerId),
                ...galleryNotDeletedFilter(),
                updatedAt: { $gte: rangeStart },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%Y-%m-%d", date: "$updatedAt" },
                },
                count: { $sum: 1 },
            },
        },
    ])
}

const aggregateOwnerTrackedDailyCounts = async (galleryIds, rangeStart) => {
    if (!galleryIds.length) return []

    return GalleryAnalyticsEvent.aggregate([
        {
            $match: {
                gallery: { $in: galleryIds },
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

const mergeDailyCountRows = (rows) =>
    rows.reduce((acc, row) => {
        const existing = acc.get(row._id)
        if (existing) {
            existing.count += row.count
        } else {
            acc.set(row._id, { _id: row._id, count: row.count })
        }
        return acc
    }, new Map())

export const loadOwnerGalleryIds = async (ownerId) => {
    const galleries = await Gallery.find({
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
    })
        .select("_id")
        .lean()

    return galleries.map((g) => g._id)
}

export const buildOwnerActivitySeries = async (
    ownerId,
    dayCount = ACTIVITY_DAY_COUNT,
    galleryIds = null
) => {
    const ids = galleryIds ?? (await loadOwnerGalleryIds(ownerId))
    const rangeStart = startOfDay(new Date())
    rangeStart.setDate(rangeStart.getDate() - (dayCount - 1))

    const [
        selectionRows,
        uploadRows,
        finalRows,
        trackedRows,
        galleryUpdateRows,
    ] = await Promise.all([
        aggregateOwnerDailyCounts(
            GalleryPhoto,
            ids,
            "selectedAt",
            rangeStart,
            { selectedByClient: true }
        ),
        aggregateOwnerDailyCounts(GalleryPhoto, ids, "createdAt", rangeStart),
        aggregateOwnerDailyCounts(GalleryFinal, ids, "createdAt", rangeStart),
        aggregateOwnerTrackedDailyCounts(ids, rangeStart),
        aggregateOwnerGalleryUpdates(ownerId, rangeStart),
    ])

    const buckets = buildDayBuckets(dayCount)
    applyCountsToBuckets(buckets, selectionRows, "selections")

    const galleryEventRows = [
        ...uploadRows,
        ...finalRows,
        ...trackedRows,
        ...galleryUpdateRows,
    ]
    applyCountsToBuckets(
        buckets,
        [...mergeDailyCountRows(galleryEventRows).values()],
        "galleryEvents"
    )

    return {
        days: dayCount,
        series: buckets,
        range: {
            from: rangeStart.toISOString(),
            to: endOfDay(new Date()).toISOString(),
        },
    }
}

const countActivityInRange = async (ownerId, galleryIds, start, end) => {
    if (!galleryIds.length) {
        const galleryUpdates = await Gallery.countDocuments({
            ...galleryOwnerFilter(ownerId),
            ...galleryNotDeletedFilter(),
            updatedAt: { $gte: start, $lte: end },
        })
        return galleryUpdates
    }

    const [selections, uploads, finals, events, galleryUpdates] =
        await Promise.all([
            GalleryPhoto.countDocuments({
                gallery: { $in: galleryIds },
                deletedAt: null,
                selectedAt: { $gte: start, $lte: end },
            }),
            GalleryPhoto.countDocuments({
                gallery: { $in: galleryIds },
                deletedAt: null,
                createdAt: { $gte: start, $lte: end },
            }),
            GalleryFinal.countDocuments({
                gallery: { $in: galleryIds },
                deletedAt: null,
                createdAt: { $gte: start, $lte: end },
            }),
            GalleryAnalyticsEvent.countDocuments({
                gallery: { $in: galleryIds },
                occurredAt: { $gte: start, $lte: end },
            }),
            Gallery.countDocuments({
                ...galleryOwnerFilter(ownerId),
                ...galleryNotDeletedFilter(),
                updatedAt: { $gte: start, $lte: end },
            }),
        ])

    return selections + uploads + finals + events + galleryUpdates
}

export const buildWeeklyActivityMetrics = async (ownerId, galleryIds = null) => {
    const ids = galleryIds ?? (await loadOwnerGalleryIds(ownerId))
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)

    const { weekStart, weekEnd } = weekRangeLocal(now)
    const prevWeekStart = new Date(weekStart)
    prevWeekStart.setDate(prevWeekStart.getDate() - 7)
    const prevWeekEnd = new Date(weekStart)
    prevWeekEnd.setMilliseconds(prevWeekEnd.getMilliseconds() - 1)

    const [today, thisWeek, previousWeek] = await Promise.all([
        countActivityInRange(ownerId, ids, todayStart, todayEnd),
        countActivityInRange(ownerId, ids, weekStart, weekEnd),
        countActivityInRange(ownerId, ids, prevWeekStart, prevWeekEnd),
    ])

    const trend = thisWeek - previousWeek

    return {
        period: "weekly",
        status: thisWeek >= previousWeek ? "on_track" : "behind",
        statusLabel: thisWeek >= previousWeek ? "On track" : "Behind pace",
        today,
        thisWeek,
        previousWeek,
        trend,
        weekStartsAt: weekStart.toISOString(),
        weekEndsAt: weekEnd.toISOString(),
    }
}

const galleryThumbnailUrl = (gallery) => {
    const useDefault = gallery.useDefaultCover !== false
    const relative = useDefault ? null : gallery.coverImageUrl
    return relative ? resolveMediaUrl(relative) : null
}

const activityLabelForGallery = (gallery) => {
    const status = gallery.status ?? "draft"
    const mapped = STATUS_ACTIVITY[status] ?? STATUS_ACTIVITY.draft

    if (status === "draft") {
        const created = gallery.createdAt ? new Date(gallery.createdAt).getTime() : 0
        const updated = gallery.updatedAt ? new Date(gallery.updatedAt).getTime() : 0
        if (updated - created > 60_000) {
            return { action: "updated", label: "Updated" }
        }
    }

    return mapped
}

export const formatDashboardGalleryCard = (galleryDoc) => {
    const plain = galleryDoc.toObject?.({ virtuals: true }) ?? galleryDoc
    const client = plain.client
    const clientBrief =
        client && typeof client === "object" && client.name != null
            ? { id: String(client._id ?? client.id), name: client.name }
            : client
              ? { id: String(client._id ?? client) }
              : null

    const thumbnailUrl = galleryThumbnailUrl(plain)
    const status = plain.status ?? "draft"
    const activity = activityLabelForGallery(plain)

    return {
        id: String(plain._id ?? plain.id),
        name: plain.name,
        description: plain.description ?? "",
        eventDate: plain.eventDate,
        status,
        statusLabel: activity.label,
        coverImageUrl: plain.coverImageUrl
            ? resolveMediaUrl(plain.coverImageUrl)
            : null,
        displayCoverUrl: thumbnailUrl,
        thumbnailUrl,
        client: clientBrief,
        updatedAt: plain.updatedAt,
        createdAt: plain.createdAt,
    }
}

export const formatDashboardActivityItem = (galleryDoc) => {
    const card = formatDashboardGalleryCard(galleryDoc)
    const activity = activityLabelForGallery(
        galleryDoc.toObject?.({ virtuals: true }) ?? galleryDoc
    )

    return {
        id: card.id,
        galleryId: card.id,
        name: card.name,
        title: card.name,
        action: activity.action,
        actionLabel: activity.label,
        status: card.status,
        statusLabel: card.statusLabel,
        client: card.client,
        project: card.name,
        occurredAt: card.updatedAt,
        date: card.updatedAt,
        thumbnailUrl: card.thumbnailUrl,
    }
}

export const loadRecentGalleries = async (ownerId, limit = 10) => {
    const rows = await Gallery.find({
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
    })
        .populate("client", "name email phone location")
        .sort({ updatedAt: -1 })
        .limit(limit)
        .exec()

    return rows.map(formatDashboardGalleryCard)
}

/** Newest galleries by creation date (for “New galleries”). */
export const loadNewGalleries = async (ownerId, limit = 5) => {
    const rows = await Gallery.find({
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
    })
        .populate("client", "name email phone location")
        .sort({ createdAt: -1 })
        .limit(limit)
        .exec()

    return rows.map(formatDashboardGalleryCard)
}

export const loadRecentActivity = async (ownerId, limit = 4) => {
    const rows = await Gallery.find({
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
    })
        .populate("client", "name")
        .sort({ updatedAt: -1 })
        .limit(limit)
        .exec()

    return rows.map(formatDashboardActivityItem)
}

export const loadNewClients = async (ownerId, limit = 4) => {
    const rows = await Client.find({ owner: ownerId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()

    return rows.map((row) => {
        const client = formatClientEmbed(row)
        return {
            id: client.id,
            name: client.name,
            email: client.email,
            phone: client.phone,
            location: client.location,
            createdAt: client.createdAt,
            dateAdded: client.createdAt,
        }
    })
}

const selectionCountsByGallery = async (galleryIds) => {
    if (!galleryIds.length) return new Map()

    const rows = await GalleryPhoto.aggregate([
        {
            $match: {
                gallery: { $in: galleryIds },
                deletedAt: null,
                selectedByClient: true,
            },
        },
        {
            $group: {
                _id: "$gallery",
                selectedCount: { $sum: 1 },
                lastSelectedAt: { $max: "$selectedAt" },
            },
        },
    ])

    return new Map(
        rows.map((row) => [
            String(row._id),
            {
                selectedCount: row.selectedCount,
                lastSelectedAt: row.lastSelectedAt ?? null,
            },
        ])
    )
}

/** Galleries currently in client selection / proofing. */
export const loadCurrentSelections = async (ownerId, limit = 4) => {
    const rows = await Gallery.find({
        ...galleryOwnerFilter(ownerId),
        ...galleryNotDeletedFilter(),
        status: "selecting",
    })
        .populate("client", "name email phone location")
        .sort({ updatedAt: -1 })
        .limit(limit)
        .exec()

    const counts = await selectionCountsByGallery(rows.map((g) => g._id))

    return rows.map((galleryDoc) => {
        const card = formatDashboardGalleryCard(galleryDoc)
        const plain = galleryDoc.toObject?.({ virtuals: true }) ?? galleryDoc
        const maxSelections =
            plain.maxSelections == null ? null : Number(plain.maxSelections)
        const stats = counts.get(card.id) ?? {
            selectedCount: 0,
            lastSelectedAt: null,
        }
        const selectedCount = stats.selectedCount
        const progressPercent =
            maxSelections != null && maxSelections > 0
                ? Math.min(
                      100,
                      Math.round((selectedCount / maxSelections) * 100)
                  )
                : null

        return {
            id: card.id,
            galleryId: card.id,
            name: card.name,
            galleryName: card.name,
            status: card.status,
            statusLabel: card.statusLabel,
            selectionStatus: "in_progress",
            client: card.client,
            selectedCount,
            maxSelections,
            selectionsRemaining:
                maxSelections != null
                    ? Math.max(0, maxSelections - selectedCount)
                    : null,
            progressPercent,
            progressLabel:
                maxSelections != null
                    ? `${selectedCount} of ${maxSelections} selected`
                    : `${selectedCount} selected`,
            lastSelectedAt: stats.lastSelectedAt,
            updatedAt: card.updatedAt,
            thumbnailUrl: card.thumbnailUrl,
        }
    })
}

/**
 * Upcoming bookings for the schedule + map section.
 * `location` is free text — frontend geocodes for map markers.
 */
export const loadUpcomingSchedules = async (ownerId, limit = 12) => {
    const rows = await Booking.find({
        ...bookingOwnerFilter(ownerId),
        startsAt: { $gte: new Date() },
    })
        .populate({ path: "client", select: "name email phone location" })
        .sort({ startsAt: 1 })
        .limit(limit)
        .exec()

    return rows.map((booking) => {
        const full = formatBookingResponse(booking)
        const locationText = full.location?.trim() || ""
        const clientLocation = full.client?.location?.trim() || ""
        const mapLocation = locationText || clientLocation || null

        return {
            id: full._id,
            bookingId: full._id,
            title: full.title,
            date: full.startsAt,
            startsAt: full.startsAt,
            endsAt: full.endsAt,
            time: full.startsAt,
            client: full.client
                ? {
                      id: full.client._id,
                      name: full.client.name,
                      email: full.client.email,
                      phone: full.client.contact,
                      location: full.client.location,
                  }
                : null,
            location: mapLocation,
            locationLabel: mapLocation,
            /** Null until frontend geocodes `location` (bookings store address text only). */
            coordinates: null,
            shootType: full.shootType,
            category: full.category,
            color: full.color,
            description: full.description,
        }
    })
}

export const formatDashboardStorage = (breakdown, plan, videoLimitBytes = 0) => {
    const limitBytes = plan.storageLimitBytes
    const usedBytes = breakdown.totalBytes
    const videoUsedBytes = Number(breakdown.videoUsedBytes) || 0
    const percentOfPlan =
        limitBytes > 0
            ? Math.round((usedBytes / limitBytes) * 10000) / 100
            : 0
    const videoPercentOfPlan =
        videoLimitBytes > 0
            ? Math.round((videoUsedBytes / videoLimitBytes) * 10000) / 100
            : 0

    const rawsPercentOfTotal =
        usedBytes > 0
            ? Math.round((breakdown.rawsBytes / usedBytes) * 10000) / 100
            : 0

    return {
        usedBytes,
        usedLabel: formatBytesLabel(usedBytes),
        limitBytes,
        limitLabel: plan.storageLabel,
        planName: plan.planName,
        planId: plan.planId,
        percentOfPlan,
        videoUsedBytes,
        videoUploadLimitBytes: videoLimitBytes,
        videoPercentOfPlan,
        breakdown: {
            rawsBytes: breakdown.rawsBytes,
            selectionsBytes: breakdown.selectionsBytes,
            finalsBytes: breakdown.finalsBytes,
        },
        focus: {
            category: "raws",
            categoryLabel: "Proofs",
            bytes: breakdown.rawsBytes,
            bytesLabel: formatBytesLabel(breakdown.rawsBytes),
            percentOfTotal: rawsPercentOfTotal,
            percentOfTotalLabel:
                usedBytes > 0
                    ? `Proofs are ${rawsPercentOfTotal}% of plan storage`
                    : "No storage used yet",
        },
    }
}

export const formatDashboardStats = (clientCount, galleryCounts) => ({
    clients: clientCount,
    galleries: galleryCounts.all,
    inProgress: galleryCounts.draft + galleryCounts.selecting,
    completed: galleryCounts.done,
    draft: galleryCounts.draft,
    selecting: galleryCounts.selecting,
    trash: galleryCounts.trash,
})
