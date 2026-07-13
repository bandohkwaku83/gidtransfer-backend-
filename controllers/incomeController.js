import mongoose from "mongoose"
import Income from "../models/Income.js"
import Client from "../models/Client.js"
import Booking from "../models/Booking.js"
import { bookingOwnerFilter } from "../utils/bookingFields.js"
import { clientOwnerFilter } from "../utils/clientFields.js"
import {
    buildIncomeListFilter,
    deriveIncomeStatus,
    formatBookingAsIncomeEntry,
    formatIncomeResponse,
    buildUninvoicedBookingIncomeFilter,
    INCOME_STATUSES,
    INCOME_STATUS_LABELS,
    incomeOwnerFilter,
    mergeIncomeListEntries,
    monthRangeLocal,
    paginateMergedEntries,
    parseIncomeInput,
    validateIncomeAmounts,
} from "../utils/incomeFields.js"
import {
    buildPaginationMeta,
    parsePagination,
} from "../utils/pagination.js"

const validationMessage = (error) =>
    Object.values(error.errors)
        .map((e) => e.message)
        .join(", ")

const MONTH_LABELS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]

const findOwnedIncomeQuery = (id, userId) => {
    if (!mongoose.isValidObjectId(id)) {
        return { error: { status: 400, message: "Invalid income id" } }
    }
    return {
        query: Income.findOne({ _id: id, ...incomeOwnerFilter(userId) }),
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

const loadOwnedBooking = async (bookingId, userId) => {
    if (!bookingId) return { booking: null }
    if (!mongoose.isValidObjectId(bookingId)) {
        return { error: { status: 400, message: "Invalid booking id" } }
    }
    const booking = await Booking.findOne({
        _id: bookingId,
        ...bookingOwnerFilter(userId),
    })
    if (!booking) {
        return { error: { status: 404, message: "Booking not found" } }
    }
    return { booking }
}

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100

export const listIncome = async (req, res) => {
    try {
        const ownerId = req.user._id
        const year = req.query.year
        const filter = buildIncomeListFilter({
            ownerId,
            year,
        })

        const pagination = parsePagination(req.query, { defaultLimit: 100, maxLimit: 500 })

        const [incomeEntries, linkedBookingIds] = await Promise.all([
            Income.find(filter).sort({ date: -1 }).lean(),
            Income.distinct("booking", {
                ...incomeOwnerFilter(ownerId),
                booking: { $ne: null },
            }),
        ])

        const bookingFilter = buildUninvoicedBookingIncomeFilter({
            ownerId,
            year,
            excludeBookingIds: linkedBookingIds,
        })

        const bookingEntries = await Booking.find(bookingFilter)
            .populate({ path: "client", select: "name" })
            .sort({ startsAt: -1 })
            .lean()

        const merged = mergeIncomeListEntries(
            incomeEntries.map(formatIncomeResponse),
            bookingEntries.map(formatBookingAsIncomeEntry)
        )

        const total = merged.length
        const pageEntries = paginateMergedEntries(merged, pagination)

        return res.status(200).json({
            count: total,
            entries: pageEntries,
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("List income error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getIncome = async (req, res) => {
    try {
        const { error, query } = findOwnedIncomeQuery(req.params.id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const entry = await query
        if (!entry) {
            return res.status(404).json({ message: "Income entry not found" })
        }

        return res.status(200).json({ entry: formatIncomeResponse(entry) })
    } catch (error) {
        console.error("Get income error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getIncomeSummary = async (req, res) => {
    try {
        const now = new Date()
        const { monthStart, monthEnd } = monthRangeLocal(now)
        const ownerId = req.user._id

        const chartYear = Number(req.query.year)
        const resolvedChartYear = Number.isFinite(chartYear)
            ? chartYear
            : now.getFullYear()

        const chartStart = new Date(resolvedChartYear, 0, 1, 0, 0, 0, 0)
        const chartEnd = new Date(resolvedChartYear, 11, 31, 23, 59, 59, 999)

        const ownerFilter = incomeOwnerFilter(ownerId)

        const [monthEntries, chartEntries, allEntries] = await Promise.all([
            Income.find({
                ...ownerFilter,
                date: { $gte: monthStart, $lte: monthEnd },
            }).select("totalAmount amountPaying status currency"),
            Income.find({
                ...ownerFilter,
                date: { $gte: chartStart, $lte: chartEnd },
            }).select("date amountPaying"),
            Income.find(ownerFilter).select(
                "totalAmount amountPaying status currency"
            ),
        ])

        const currency =
            monthEntries.find((entry) => entry.currency)?.currency?.trim() ||
            allEntries.find((entry) => entry.currency)?.currency?.trim() ||
            "GHS"

        let collectedThisMonth = 0
        let invoicedThisMonth = 0
        let paidBookingsCount = 0

        for (const entry of monthEntries) {
            const total = Number(entry.totalAmount ?? 0)
            const paid = Number(entry.amountPaying ?? 0)
            collectedThisMonth += paid
            invoicedThisMonth += total
            if (entry.status === "paid") {
                paidBookingsCount += 1
            }
        }

        let pendingTotal = 0
        for (const entry of allEntries) {
            const total = Number(entry.totalAmount ?? 0)
            const paid = Number(entry.amountPaying ?? 0)
            if (entry.status === "partial" || entry.status === "invoiced") {
                pendingTotal += Math.max(0, total - paid)
            }
        }

        const monthlyBuckets = Array.from({ length: 12 }, (_, index) => ({
            label: MONTH_LABELS[index],
            value: 0,
            dateKey: `${resolvedChartYear}-${String(index + 1).padStart(2, "0")}`,
        }))

        for (const entry of chartEntries) {
            const monthIndex = new Date(entry.date).getMonth()
            if (monthIndex >= 0 && monthIndex < 12) {
                monthlyBuckets[monthIndex].value += Number(entry.amountPaying ?? 0)
            }
        }

        const byStatusMap = Object.fromEntries(
            INCOME_STATUSES.map((status) => [status, 0])
        )
        for (const entry of allEntries) {
            const status = entry.status
            if (byStatusMap[status] !== undefined) {
                byStatusMap[status] += Number(entry.totalAmount ?? 0)
            }
        }

        return res.status(200).json({
            summary: {
                collectedThisMonth: roundMoney(collectedThisMonth),
                pendingTotal: roundMoney(pendingTotal),
                invoicedThisMonth: roundMoney(invoicedThisMonth),
                paidBookingsCount,
                currency,
            },
            monthlyRevenue: monthlyBuckets.map((bucket) => ({
                ...bucket,
                value: roundMoney(bucket.value),
            })),
            byStatus: INCOME_STATUSES.map((key) => ({
                key,
                label: INCOME_STATUS_LABELS[key],
                value: roundMoney(byStatusMap[key]),
            })),
        })
    } catch (error) {
        console.error("Income summary error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createIncome = async (req, res) => {
    try {
        const { fields, errors } = parseIncomeInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const amountError = validateIncomeAmounts(
            fields.totalAmount,
            fields.amountPaying ?? 0
        )
        if (amountError) {
            return res.status(400).json({ message: amountError })
        }

        const { error, client } = await loadOwnedClient(fields.clientId, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const bookingResult = await loadOwnedBooking(fields.bookingId, req.user._id)
        if (bookingResult.error) {
            return res
                .status(bookingResult.error.status)
                .json({ message: bookingResult.error.message })
        }

        const entry = await Income.create({
            owner: req.user._id,
            client: client._id,
            clientName: client.name,
            title: fields.title,
            shootType: fields.shootType,
            totalAmount: fields.totalAmount,
            amountPaying: fields.amountPaying ?? 0,
            currency: fields.currency ?? "GHS",
            status: deriveIncomeStatus(fields.totalAmount, fields.amountPaying ?? 0),
            booking: bookingResult.booking?._id ?? null,
            date: fields.date,
        })

        return res.status(201).json({
            message: "Income added.",
            entry: formatIncomeResponse(entry),
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("Create income error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateIncome = async (req, res) => {
    try {
        const { error, query } = findOwnedIncomeQuery(req.params.id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const existing = await query
        if (!existing) {
            return res.status(404).json({ message: "Income entry not found" })
        }

        const { fields, errors } = parseIncomeInput(req.body, { partial: true })
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" })
        }

        if (fields.clientId) {
            const clientResult = await loadOwnedClient(fields.clientId, req.user._id)
            if (clientResult.error) {
                return res
                    .status(clientResult.error.status)
                    .json({ message: clientResult.error.message })
            }
            existing.client = clientResult.client._id
            existing.clientName = clientResult.client.name
        }

        if (fields.bookingId !== undefined) {
            const bookingResult = await loadOwnedBooking(fields.bookingId, req.user._id)
            if (bookingResult.error) {
                return res
                    .status(bookingResult.error.status)
                    .json({ message: bookingResult.error.message })
            }
            existing.booking = bookingResult.booking?._id ?? null
        }

        if (fields.title !== undefined) existing.title = fields.title
        if (fields.shootType !== undefined) existing.shootType = fields.shootType
        if (fields.date !== undefined) existing.date = fields.date
        if (fields.totalAmount !== undefined) existing.totalAmount = fields.totalAmount
        if (fields.amountPaying !== undefined) existing.amountPaying = fields.amountPaying
        if (fields.currency !== undefined) existing.currency = fields.currency

        const amountError = validateIncomeAmounts(
            existing.totalAmount,
            existing.amountPaying
        )
        if (amountError) {
            return res.status(400).json({ message: amountError })
        }

        existing.status = deriveIncomeStatus(
            existing.totalAmount,
            existing.amountPaying
        )

        await existing.save()

        return res.status(200).json({
            message: "Income updated.",
            entry: formatIncomeResponse(existing),
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("Update income error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteIncome = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid income id" })
        }

        const entry = await Income.findOneAndDelete({
            _id: id,
            ...incomeOwnerFilter(req.user._id),
        })

        if (!entry) {
            return res.status(404).json({ message: "Income entry not found" })
        }

        return res.status(200).json({
            message: "Income deleted.",
            entry: formatIncomeResponse(entry),
        })
    } catch (error) {
        console.error("Delete income error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
