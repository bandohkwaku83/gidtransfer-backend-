import mongoose from "mongoose"
import Client from "../models/Client.js"
import Booking from "../models/Booking.js"
import User from "../models/User.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import {
    shootTypeLabel,
} from "../utils/bookingShootTypes.js"
import { logAdminAction, requireAuditReason } from "../utils/adminAudit.js"

const escapeRegex = (value) =>
    String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const parseDateBoundary = (value, { endOfDay = false } = {}) => {
    if (value === undefined || value === null || String(value).trim() === "") {
        return null
    }
    const raw = String(value).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    }
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
}

const wantsPii = (query, body) => {
    const raw = query?.includePii ?? body?.includePii ?? query?.pii
    return (
        raw === true ||
        raw === "true" ||
        raw === 1 ||
        raw === "1" ||
        raw === "yes"
    )
}

const formatStudioClientAggregate = (row, userMap) => {
    const user = userMap.get(String(row._id))
    return {
        userId: row._id,
        email: user?.email ?? null,
        companyName: user?.studio?.companyName?.trim() || "",
        companySlug: user?.studio?.companySlug?.trim() || "",
        isActive: user ? user.isActive !== false : null,
        clientCount: row.clientCount ?? 0,
        latestClientAt: row.latestClientAt ?? null,
    }
}

const formatBookingAdminRow = (booking, { includePii = false } = {}) => {
    const plain = booking.toObject?.() ?? booking
    const owner = plain.owner?.toObject?.() ?? plain.owner ?? {}
    const client = plain.client?.toObject?.() ?? plain.client ?? {}

    const clientOut = {
        id: client._id ?? client.id ?? null,
        name: client.name ?? null,
    }
    if (includePii) {
        clientOut.email = client.email?.trim() || ""
        clientOut.phone = client.phone ?? ""
        clientOut.location = client.location ?? ""
    }

    return {
        id: plain._id ?? plain.id,
        title: plain.title,
        category: plain.category,
        categoryLabel: shootTypeLabel(plain.category),
        startsAt: plain.startsAt,
        endsAt: plain.endsAt,
        location: includePii ? plain.location ?? "" : undefined,
        amountCharged: plain.amountCharged ?? 0,
        currency: plain.currency ?? "GHS",
        invoicedAt: plain.invoicedAt ?? null,
        studio: {
            userId: owner._id ?? owner.id ?? plain.owner,
            email: owner.email ?? null,
            companyName: owner.studio?.companyName?.trim?.() || "",
            companySlug: owner.studio?.companySlug?.trim?.() || "",
        },
        client: clientOut,
        createdAt: plain.createdAt,
        updatedAt: plain.updatedAt,
    }
}

export const listStudioClientTotals = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const search = String(req.query.search ?? req.query.q ?? "").trim()

        let ownerMatch = {}
        if (search) {
            const users = await User.find({
                $or: [
                    { email: new RegExp(escapeRegex(search), "i") },
                    {
                        "studio.companyName": new RegExp(
                            escapeRegex(search),
                            "i"
                        ),
                    },
                    {
                        "studio.companySlug": new RegExp(
                            escapeRegex(search),
                            "i"
                        ),
                    },
                ],
            })
                .select("_id")
                .lean()
                .exec()
            ownerMatch = { owner: { $in: users.map((u) => u._id) } }
        }

        const ownerId = String(req.query.ownerId ?? req.query.userId ?? "").trim()
        if (ownerId) {
            if (!mongoose.isValidObjectId(ownerId)) {
                return res.status(400).json({ message: "Invalid ownerId" })
            }
            ownerMatch = { owner: new mongoose.Types.ObjectId(ownerId) }
        }

        const pipeline = [
            { $match: ownerMatch },
            {
                $group: {
                    _id: "$owner",
                    clientCount: { $sum: 1 },
                    latestClientAt: { $max: "$createdAt" },
                },
            },
            { $sort: { clientCount: -1, latestClientAt: -1 } },
            {
                $facet: {
                    meta: [{ $count: "total" }],
                    items: [
                        { $skip: pagination.skip },
                        { $limit: pagination.limit },
                    ],
                },
            },
        ]

        const [facet] = await Client.aggregate(pipeline)
        const total = facet?.meta?.[0]?.total ?? 0
        const items = facet?.items ?? []
        const userIds = items.map((row) => row._id)
        const users = userIds.length
            ? await User.find({ _id: { $in: userIds } })
                  .select(
                      "email isActive studio.companyName studio.companySlug"
                  )
                  .lean()
                  .exec()
            : []
        const userMap = new Map(users.map((u) => [String(u._id), u]))

        return res.status(200).json({
            items: items.map((row) =>
                formatStudioClientAggregate(row, userMap)
            ),
            pagination: buildPaginationMeta({ ...pagination, total }),
            note: "Aggregate client counts only — no client PII in this response",
        })
    } catch (error) {
        console.error("listStudioClientTotals:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listAdminBookingsCalendar = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 100,
            maxLimit: 500,
        })
        const includePii = wantsPii(req.query, req.body)

        if (includePii) {
            const { error: reasonError, reason } = requireAuditReason(
                req.query?.reason ?? req.body?.reason
            )
            if (reasonError) {
                return res.status(400).json({
                    message:
                        "PII export requires reason (query or body). Pass includePii=true&reason=...",
                })
            }
            await logAdminAction({
                admin: req.admin,
                action: "crm.bookings.pii_export",
                reason,
                resourceType: "booking",
                resourceId: "calendar",
                meta: {
                    adminRole: req.admin?.role || "admin",
                    filters: {
                        ownerId: req.query.ownerId ?? req.query.userId ?? null,
                        shootType: req.query.shootType ?? req.query.category ?? null,
                        dateFrom: req.query.dateFrom ?? req.query.from ?? null,
                        dateTo: req.query.dateTo ?? req.query.to ?? null,
                    },
                },
            })
        }

        const filter = {}
        const ownerId = String(
            req.query.ownerId ?? req.query.userId ?? req.query.studioId ?? ""
        ).trim()
        if (ownerId) {
            if (!mongoose.isValidObjectId(ownerId)) {
                return res.status(400).json({ message: "Invalid ownerId" })
            }
            filter.owner = ownerId
        }

        const shootType = String(
            req.query.shootType ?? req.query.category ?? ""
        ).trim()
        if (shootType) {
            filter.category = shootType
        }

        const dateFrom = parseDateBoundary(
            req.query.dateFrom ?? req.query.from ?? req.query.startsFrom
        )
        const dateTo = parseDateBoundary(
            req.query.dateTo ?? req.query.to ?? req.query.startsTo,
            { endOfDay: true }
        )
        if (dateFrom || dateTo) {
            filter.startsAt = {}
            if (dateFrom) filter.startsAt.$gte = dateFrom
            if (dateTo) filter.startsAt.$lte = dateTo
        }

        const [total, rows] = await Promise.all([
            Booking.countDocuments(filter),
            paginatedQuery(
                Booking.find(filter)
                    .populate({
                        path: "owner",
                        select: "email studio.companyName studio.companySlug",
                    })
                    .populate({
                        path: "client",
                        select: includePii
                            ? "name email phone location"
                            : "name",
                    })
                    .sort({ startsAt: 1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            includePii,
            items: rows.map((row) =>
                formatBookingAdminRow(row, { includePii })
            ),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listAdminBookingsCalendar:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getStudioCrmSummary = async (req, res) => {
    try {
        const { userId } = req.params
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ message: "Invalid user id" })
        }

        const user = await User.findById(userId).select(
            "email isActive studio.companyName studio.companySlug"
        )
        if (!user) {
            return res.status(404).json({ message: "Photographer not found" })
        }

        const includePii = wantsPii(req.query, req.body)
        if (includePii) {
            const { error: reasonError, reason } = requireAuditReason(
                req.query?.reason ?? req.body?.reason
            )
            if (reasonError) {
                return res.status(400).json({
                    message:
                        "PII export requires reason. Pass includePii=true&reason=...",
                })
            }
            await logAdminAction({
                admin: req.admin,
                action: "crm.studio.pii_export",
                reason,
                resourceType: "user",
                resourceId: String(user._id),
                meta: { adminRole: req.admin?.role || "admin" },
            })
        }

        const now = new Date()
        const monthStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
        )

        const [clientCount, upcomingBookings, monthBookings, recentClients] =
            await Promise.all([
                Client.countDocuments({ owner: user._id }),
                Booking.countDocuments({
                    owner: user._id,
                    startsAt: { $gte: now },
                }),
                Booking.countDocuments({
                    owner: user._id,
                    startsAt: { $gte: monthStart },
                }),
                includePii
                    ? Client.find({ owner: user._id })
                          .sort({ createdAt: -1 })
                          .limit(20)
                          .select("name email phone location createdAt")
                          .lean()
                          .exec()
                    : Client.find({ owner: user._id })
                          .sort({ createdAt: -1 })
                          .limit(20)
                          .select("name createdAt")
                          .lean()
                          .exec(),
            ])

        return res.status(200).json({
            studio: {
                userId: user._id,
                email: user.email,
                companyName: user.studio?.companyName?.trim() || "",
                companySlug: user.studio?.companySlug?.trim() || "",
                isActive: user.isActive !== false,
            },
            totals: {
                clients: clientCount,
                upcomingBookings,
                bookingsThisMonth: monthBookings,
            },
            includePii,
            recentClients: recentClients.map((c) => ({
                id: c._id,
                name: c.name,
                ...(includePii
                    ? {
                          email: c.email?.trim() || "",
                          phone: c.phone ?? "",
                          location: c.location ?? "",
                      }
                    : {}),
                createdAt: c.createdAt,
            })),
        })
    } catch (error) {
        console.error("getStudioCrmSummary:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
