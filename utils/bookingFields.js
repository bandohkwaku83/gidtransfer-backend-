import {
    normalizeShootCategory,
    shootTypeColor,
    shootTypeLabel,
} from "./bookingShootTypes.js"

const pad2 = (n) => String(n).padStart(2, "0")

export const bookingOwnerFilter = (userId) => ({
    owner: userId,
})

export const parseAmountCharged = (raw, { partial = false } = {}) => {
    if (raw === undefined || raw === null || raw === "") {
        if (partial) return { value: undefined }
        return { value: 0 }
    }

    const num =
        typeof raw === "number"
            ? raw
            : Number(String(raw).replace(/,/g, "").trim())

    if (!Number.isFinite(num) || num < 0) {
        return { error: "Amount charged must be a valid non-negative number" }
    }

    return { value: Math.round(num * 100) / 100 }
}

export const parseTimeOnDate = (dateIso, timeStr) => {
    const date = dateIso?.trim()
    const time = timeStr?.trim()
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return { error: "Valid date (YYYY-MM-DD) is required" }
    }
    if (!time) {
        return { error: "Start time is required" }
    }

    if (/am|pm/i.test(time)) {
        const parsed = new Date(`${date} ${time}`)
        if (!Number.isNaN(parsed.getTime())) {
            return { date: parsed }
        }
    }

    const match = /^(\d{1,2}):(\d{2})$/.exec(time)
    if (match) {
        const hours = Number(match[1])
        const minutes = Number(match[2])
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
            const parsed = new Date(
                `${date}T${pad2(hours)}:${pad2(minutes)}:00`
            )
            if (!Number.isNaN(parsed.getTime())) {
                return { date: parsed }
            }
        }
    }

    return { error: "Invalid time format" }
}

export const parseBookingInput = (body, { partial = false } = {}) => {
    const {
        title,
        clientId,
        date,
        shootType,
        start,
        startTime,
        end,
        endTime,
        location,
        description,
        notes,
        amountCharged,
        amount,
        currency,
    } = body

    const fields = {}
    const errors = []

    if (title !== undefined || !partial) {
        const trimmed = title?.trim()
        if (!trimmed) {
            if (!partial) errors.push("Shoot title is required")
        } else {
            fields.title = trimmed
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

    if (shootType !== undefined || !partial) {
        const normalized = normalizeShootCategory(shootType)
        if (normalized.error) {
            if (!partial) errors.push(normalized.error)
        } else {
            fields.category = normalized.category
        }
    }

    const resolvedDate = date?.trim()
    const resolvedStart = (start ?? startTime)?.trim()
    const resolvedEnd = (end ?? endTime)?.trim()

    if (resolvedDate !== undefined || resolvedStart !== undefined || !partial) {
        const startParsed = parseTimeOnDate(resolvedDate, resolvedStart)
        if (startParsed.error) {
            if (!partial) errors.push(startParsed.error)
        } else {
            fields.startsAt = startParsed.date
        }
    }

    if (resolvedEnd) {
        const endDateIso = resolvedDate || fields.startsAt?.toISOString().slice(0, 10)
        const endParsed = parseTimeOnDate(endDateIso, resolvedEnd)
        if (endParsed.error) {
            errors.push(endParsed.error)
        } else if (fields.startsAt && endParsed.date <= fields.startsAt) {
            errors.push("End time must be after start time")
        } else {
            fields.endsAt = endParsed.date
        }
    } else if (resolvedEnd === "" || end === "" || endTime === "") {
        fields.endsAt = null
    }

    if (location !== undefined) {
        fields.location = location?.trim() ?? ""
    } else if (!partial) {
        fields.location = ""
    }

    const resolvedNotes = notes !== undefined ? notes : description

    if (resolvedNotes !== undefined) {
        fields.description = resolvedNotes?.trim() ?? ""
    } else if (!partial) {
        fields.description = ""
    }

    const amountRaw =
        amountCharged !== undefined
            ? amountCharged
            : amount !== undefined
              ? amount
              : body.amount_charged
    if (amountRaw !== undefined || !partial) {
        const parsed = parseAmountCharged(amountRaw, { partial })
        if (parsed.error) {
            errors.push(parsed.error)
        } else if (parsed.value !== undefined) {
            fields.amountCharged = parsed.value
        }
    }

    if (currency !== undefined) {
        const code = String(currency).trim().toUpperCase()
        if (code) fields.currency = code
    } else if (!partial) {
        fields.currency = "GHS"
    }

    return { fields, errors }
}

export const buildBookingListFilter = ({
    ownerId,
    year,
    month,
    type,
    from,
    to,
    day,
}) => {
    const filter = { ...bookingOwnerFilter(ownerId) }

    if (year !== undefined && month !== undefined) {
        const y = Number(year)
        const m = Number(month)
        if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
            const start = new Date(y, m - 1, 1, 0, 0, 0, 0)
            const end = new Date(y, m, 0, 23, 59, 59, 999)
            filter.startsAt = { $gte: start, $lte: end }
        }
    }

    if (from || to) {
        filter.startsAt = filter.startsAt ?? {}
        if (from) {
            const fromDate = new Date(from)
            if (!Number.isNaN(fromDate.getTime())) {
                filter.startsAt.$gte = fromDate
            }
        }
        if (to) {
            const toDate = new Date(to)
            if (!Number.isNaN(toDate.getTime())) {
                filter.startsAt.$lte = toDate
            }
        }
    }

    if (day) {
        const d = new Date(`${day}T00:00:00`)
        if (!Number.isNaN(d.getTime())) {
            const end = new Date(d)
            end.setHours(23, 59, 59, 999)
            filter.startsAt = { $gte: d, $lte: end }
        }
    }

    if (type?.trim()) {
        const normalized = normalizeShootCategory(type)
        if (!normalized.error) {
            filter.category = normalized.category
        }
    }

    return filter
}

export const formatBookingClient = (client) => {
    if (!client) return null
    const doc = client.toJSON ? client.toJSON() : client
    return {
        _id: String(doc._id),
        name: doc.name,
        contact: doc.phone?.trim() || doc.contact?.trim() || "",
        email: doc.email?.trim() || "",
        location: doc.location?.trim() || "",
    }
}

export const formatBookingResponse = (booking) => {
    const doc = booking.toJSON ? booking.toJSON() : booking
    const client =
        doc.client && typeof doc.client === "object"
            ? formatBookingClient(doc.client)
            : null

    return {
        _id: String(doc._id),
        title: doc.title,
        client,
        shootType: shootTypeLabel(doc.category),
        category: doc.category,
        color: shootTypeColor(doc.category),
        amountCharged: Number(doc.amountCharged ?? 0),
        currency: doc.currency?.trim() || "GHS",
        startsAt: doc.startsAt,
        endsAt: doc.endsAt ?? null,
        location: doc.location?.trim() || undefined,
        description: doc.description?.trim() || undefined,
        notes: doc.description?.trim() || undefined,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    }
}

export const weekRangeLocal = (reference = new Date()) => {
    const now = new Date(reference)
    const day = now.getDay()
    const diffToMon = (day + 6) % 7
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - diffToMon)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    return { weekStart, weekEnd }
}
