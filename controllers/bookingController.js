import mongoose from "mongoose"
import Booking from "../models/Booking.js"
import Client from "../models/Client.js"
import { BOOKING_SHOOT_TYPES } from "../utils/bookingShootTypes.js"
import {
    bookingOwnerFilter,
    buildBookingListFilter,
    formatBookingResponse,
    formatBookingSummary,
    parseBookingInput,
    weekRangeLocal,
} from "../utils/bookingFields.js"
import { clientOwnerFilter } from "../utils/clientFields.js"
import { bookingDetailUrl } from "../utils/appLinks.js"
import { buildBookingIcs } from "../utils/bookingCalendar.js"
import {
    notifyPhotographerBookingConfirmation,
    queuePhotographerEmail,
} from "../utils/photographerNotifications.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import { buildUpdatedSinceFilter, parseSinceQuery } from "../utils/incrementalSync.js"
import { isSummaryView } from "../utils/sparseFields.js"
import { sendOwnerJson } from "../utils/listResponse.js"
import { publishOwnerChange } from "../utils/syncRevision.js"

const validationMessage = (error) =>
    Object.values(error.errors)
        .map((e) => e.message)
        .join(", ")

const populateClient = { path: "client", select: "name email phone location" }

const findOwnedBookingQuery = (id, userId) => {
    if (!mongoose.isValidObjectId(id)) {
        return { error: { status: 400, message: "Invalid booking id" } }
    }
    return {
        query: Booking.findOne({ _id: id, ...bookingOwnerFilter(userId) }).populate(
            populateClient
        ),
    }
}

const loadOwnedClient = async (clientId, userId) => {
    if (!mongoose.isValidObjectId(clientId)) {
        return { error: { status: 400, message: "Invalid client id" } }
    }
    const client = await Client.findOne({
        _id: clientId,
        ...clientOwnerFilter(userId),
    })
    if (!client) {
        return { error: { status: 404, message: "Client not found" } }
    }
    return { client }
}

export const getBookingsMeta = async (_req, res) => {
    return res.status(200).json({
        shootTypes: BOOKING_SHOOT_TYPES,
        legend: BOOKING_SHOOT_TYPES,
        clientsListPath: "/dashboard/clients",
    })
}

export const getBookingsWeekSummary = async (req, res) => {
    try {
        const { weekStart, weekEnd } = weekRangeLocal()
        const bookedCount = await Booking.countDocuments({
            ...bookingOwnerFilter(req.user._id),
            startsAt: { $gte: weekStart, $lte: weekEnd },
        })

        return res.status(200).json({
            bookedCount,
            weekStartsAt: weekStart.toISOString(),
            weekEndsAt: weekEnd.toISOString(),
        })
    } catch (error) {
        console.error("Bookings week summary error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getBookingsStats = async (req, res) => {
    try {
        const now = new Date()
        const { weekStart, weekEnd } = weekRangeLocal(now)

        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
        const monthEnd = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
        )

        const todayStart = new Date(now)
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date(now)
        todayEnd.setHours(23, 59, 59, 999)

        const ownerFilter = bookingOwnerFilter(req.user._id)

        const [thisWeekCount, thisMonthCount, todayCount] = await Promise.all([
            Booking.countDocuments({
                ...ownerFilter,
                startsAt: { $gte: weekStart, $lte: weekEnd },
            }),
            Booking.countDocuments({
                ...ownerFilter,
                startsAt: { $gte: monthStart, $lte: monthEnd },
            }),
            Booking.countDocuments({
                ...ownerFilter,
                startsAt: { $gte: todayStart, $lte: todayEnd },
            }),
        ])

        return res.status(200).json({
            thisWeekCount,
            thisMonthCount,
            todayCount,
        })
    } catch (error) {
        console.error("Bookings stats error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getUpcomingBooking = async (req, res) => {
    try {
        const now = new Date()
        const booking = await Booking.findOne({
            ...bookingOwnerFilter(req.user._id),
            startsAt: { $gte: now },
        })
            .sort({ startsAt: 1 })
            .populate(populateClient)

        if (!booking) {
            return res.status(200).json({ booking: null })
        }

        return res.status(200).json({ booking: formatBookingResponse(booking) })
    } catch (error) {
        console.error("Upcoming booking error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listBookings = async (req, res) => {
    try {
        const filter = buildBookingListFilter({
            ownerId: req.user._id,
            year: req.query.year,
            month: req.query.month,
            type: req.query.type,
            from: req.query.from,
            to: req.query.to,
            day: req.query.day,
        })

        const sinceParsed = parseSinceQuery(req.query)
        if (sinceParsed?.error) {
            return res.status(400).json({ message: sinceParsed.error })
        }
        if (sinceParsed?.since) {
            Object.assign(filter, buildUpdatedSinceFilter(sinceParsed.since))
        }

        const pagination = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 })
        const summary = isSummaryView(req.query)

        const [total, rows] = await Promise.all([
            Booking.countDocuments(filter),
            paginatedQuery(
                Booking.find(filter).populate(populateClient).sort({ startsAt: 1 }),
                pagination
            ).exec(),
        ])

        const formatRow = summary ? formatBookingSummary : formatBookingResponse
        const bookings = rows.map(formatRow)

        return sendOwnerJson(
            req,
            res,
            req.user._id,
            {
                count: total,
                bookings,
                pagination: buildPaginationMeta({ ...pagination, total }),
            },
            {
                etagSeed: {
                    since: sinceParsed?.since?.toISOString() ?? null,
                    view: summary ? "summary" : "full",
                },
            }
        )
    } catch (error) {
        console.error("List bookings error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getBooking = async (req, res) => {
    try {
        const { error, query } = findOwnedBookingQuery(req.params.id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const booking = await query
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" })
        }

        return res.status(200).json({ booking: formatBookingResponse(booking) })
    } catch (error) {
        console.error("Get booking error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getBookingCalendar = async (req, res) => {
    try {
        const { error, query } = findOwnedBookingQuery(req.params.id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const booking = await query
        if (!booking) {
            return res.status(404).json({ message: "Booking not found" })
        }

        const studioName = req.user.studio?.companyName?.trim() || "Studio"
        const companySlug = req.user.studio?.companySlug
        const ics = buildBookingIcs({
            booking,
            client: booking.client,
            studioName,
            actionUrl: bookingDetailUrl(booking._id, companySlug),
        })

        if (!ics) {
            return res.status(400).json({ message: "Booking has invalid dates for calendar export" })
        }

        const safeTitle = String(booking.title ?? "booking")
            .replace(/[^\w\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .slice(0, 40)

        res.setHeader("Content-Type", "text/calendar; charset=utf-8")
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(safeTitle || "booking")}.ics"`
        )
        return res.status(200).send(ics)
    } catch (error) {
        console.error("Get booking calendar error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createBooking = async (req, res) => {
    try {
        const { fields, errors } = parseBookingInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const { error, client } = await loadOwnedClient(fields.clientId, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const booking = await Booking.create({
            owner: req.user._id,
            client: client._id,
            title: fields.title,
            category: fields.category,
            startsAt: fields.startsAt,
            endsAt: fields.endsAt ?? null,
            location: fields.location ?? "",
            description: fields.description ?? "",
            amountCharged: fields.amountCharged ?? 0,
            currency: fields.currency ?? "GHS",
        })

        await booking.populate(populateClient)

        queuePhotographerEmail(
            notifyPhotographerBookingConfirmation({
                ownerId: req.user._id,
                booking,
                client: booking.client,
            })
        )

        await publishOwnerChange(req.user._id)

        return res.status(201).json({
            message: "Booking created successfully",
            booking: formatBookingResponse(booking),
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("Create booking error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateBooking = async (req, res) => {
    try {
        const { error, query } = findOwnedBookingQuery(req.params.id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const existing = await query
        if (!existing) {
            return res.status(404).json({ message: "Booking not found" })
        }

        const { fields, errors } = parseBookingInput(req.body, { partial: true })
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" })
        }

        if (fields.clientId) {
            const clientResult = await loadOwnedClient(
                fields.clientId,
                req.user._id
            )
            if (clientResult.error) {
                return res
                    .status(clientResult.error.status)
                    .json({ message: clientResult.error.message })
            }
            existing.client = clientResult.client._id
        }

        if (fields.title !== undefined) existing.title = fields.title
        if (fields.category !== undefined) existing.category = fields.category
        if (fields.startsAt !== undefined) existing.startsAt = fields.startsAt
        if (fields.startsAt !== undefined) {
            existing.dayReminderEmailSentAt = null
            existing.hourReminderEmailSentAt = null
        }
        if (fields.endsAt !== undefined) existing.endsAt = fields.endsAt
        if (fields.location !== undefined) existing.location = fields.location
        if (fields.description !== undefined) {
            existing.description = fields.description
        }
        if (fields.amountCharged !== undefined) {
            existing.amountCharged = fields.amountCharged
        }
        if (fields.currency !== undefined) {
            existing.currency = fields.currency
        }

        await existing.save()
        await existing.populate(populateClient)

        await publishOwnerChange(req.user._id)

        return res.status(200).json({
            message: "Booking updated successfully",
            booking: formatBookingResponse(existing),
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("Update booking error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteBooking = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid booking id" })
        }

        const booking = await Booking.findOneAndDelete({
            _id: id,
            ...bookingOwnerFilter(req.user._id),
        }).populate(populateClient)

        if (!booking) {
            return res.status(404).json({ message: "Booking not found" })
        }

        await publishOwnerChange(req.user._id)

        return res.status(200).json({
            message: "Booking deleted successfully",
            booking: formatBookingResponse(booking),
        })
    } catch (error) {
        console.error("Delete booking error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
