import { parseAmountCharged } from "./bookingFields.js"

export const INCOME_STATUSES = ["paid", "pending", "partial", "invoiced"]

export const INCOME_STATUS_LABELS = {
    paid: "Paid",
    pending: "Pending",
    partial: "Partial",
    invoiced: "Invoiced",
}

export const incomeOwnerFilter = (userId) => ({
    owner: userId,
})

export const deriveIncomeStatus = (totalAmount, amountPaying) => {
    const total = Math.max(0, Number(totalAmount) || 0)
    const paid = Math.max(0, Number(amountPaying) || 0)
    if (total <= 0) return "pending"
    if (paid <= 0) return "invoiced"
    if (paid >= total) return "paid"
    return "partial"
}

const parseIncomeDate = (raw) => {
    const date = raw?.trim()
    if (!date) {
        return { error: "Date is required" }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const parsed = new Date(`${date}T12:00:00.000Z`)
        if (!Number.isNaN(parsed.getTime())) {
            return { date: parsed }
        }
    }
    const parsed = new Date(date)
    if (!Number.isNaN(parsed.getTime())) {
        return { date: parsed }
    }
    return { error: "Valid date (YYYY-MM-DD) is required" }
}

const parseIncomeAmount = (raw, { fieldName, partial = false, allowZero = false } = {}) => {
    if (raw === undefined || raw === null || raw === "") {
        if (partial) return { value: undefined }
        return { error: `${fieldName} is required` }
    }

    const parsed = parseAmountCharged(raw, { partial })
    if (parsed.error) {
        return { error: parsed.error.replace("Amount charged", fieldName) }
    }
    if (parsed.value === undefined) {
        return { value: undefined }
    }
    if (!allowZero && parsed.value <= 0) {
        return { error: `${fieldName} must be greater than 0` }
    }
    return { value: parsed.value }
}

export const parseIncomeInput = (body, { partial = false } = {}) => {
    const {
        date,
        clientId,
        title,
        shootType,
        totalAmount,
        amountPaying,
        currency,
        bookingId,
    } = body

    const fields = {}
    const errors = []

    if (date !== undefined || !partial) {
        const parsed = parseIncomeDate(date)
        if (parsed.error) {
            if (!partial) errors.push(parsed.error)
        } else {
            fields.date = parsed.date
        }
    }

    if (clientId !== undefined || !partial) {
        const id = clientId?.trim()
        if (!id) {
            if (!partial) errors.push("Client is required")
        } else {
            fields.clientId = id
        }
    }

    if (title !== undefined || !partial) {
        const trimmed = title?.trim()
        if (!trimmed) {
            if (!partial) errors.push("Title is required")
        } else {
            fields.title = trimmed
        }
    }

    if (shootType !== undefined || !partial) {
        const trimmed = shootType?.trim()
        if (!trimmed) {
            if (!partial) errors.push("Shoot type is required")
        } else {
            fields.shootType = trimmed
        }
    }

    if (totalAmount !== undefined || !partial) {
        const parsed = parseIncomeAmount(totalAmount, {
            fieldName: "Total amount",
            partial,
            allowZero: false,
        })
        if (parsed.error) {
            if (!partial) errors.push(parsed.error)
        } else if (parsed.value !== undefined) {
            fields.totalAmount = parsed.value
        }
    }

    if (amountPaying !== undefined || !partial) {
        const parsed = parseIncomeAmount(amountPaying, {
            fieldName: "Amount paying",
            partial,
            allowZero: true,
        })
        if (parsed.error) {
            if (!partial) errors.push(parsed.error)
        } else if (parsed.value !== undefined) {
            fields.amountPaying = parsed.value
        } else if (!partial) {
            fields.amountPaying = 0
        }
    }

    if (currency !== undefined) {
        const code = String(currency).trim().toUpperCase()
        if (code) fields.currency = code
    } else if (!partial) {
        fields.currency = "GHS"
    }

    if (bookingId !== undefined) {
        const id = bookingId?.trim()
        fields.bookingId = id || null
    }

    return { fields, errors }
}

export const validateIncomeAmounts = (totalAmount, amountPaying) => {
    const total = Number(totalAmount)
    const paying = Number(amountPaying ?? 0)

    if (!Number.isFinite(total) || total <= 0) {
        return "Total amount must be greater than 0"
    }
    if (!Number.isFinite(paying) || paying < 0) {
        return "Amount paying must be a valid non-negative number"
    }
    if (paying > total) {
        return "Amount paying cannot exceed total amount"
    }
    return null
}

export const buildIncomeListFilter = ({ ownerId, year }) => {
    const filter = { ...incomeOwnerFilter(ownerId) }

    if (year !== undefined && year !== null && String(year).trim() !== "") {
        const y = Number(year)
        if (Number.isFinite(y)) {
            const start = new Date(y, 0, 1, 0, 0, 0, 0)
            const end = new Date(y, 11, 31, 23, 59, 59, 999)
            filter.date = { $gte: start, $lte: end }
        }
    }

    return filter
}

export const monthRangeLocal = (reference = new Date()) => {
    const now = new Date(reference)
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
    return { monthStart, monthEnd }
}

export const formatIncomeResponse = (entry) => {
    const doc = entry.toJSON ? entry.toJSON() : entry
    const clientId =
        doc.client && typeof doc.client === "object"
            ? String(doc.client._id)
            : doc.client
              ? String(doc.client)
              : undefined

    return {
        _id: String(doc._id),
        date: doc.date,
        clientId,
        clientName: doc.clientName?.trim() || "",
        title: doc.title,
        shootType: doc.shootType,
        totalAmount: Number(doc.totalAmount ?? 0),
        amountPaying: Number(doc.amountPaying ?? 0),
        currency: doc.currency?.trim() || "GHS",
        status: doc.status,
        bookingId: doc.booking ? String(doc.booking) : undefined,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    }
}
