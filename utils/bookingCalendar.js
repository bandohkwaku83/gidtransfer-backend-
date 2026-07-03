const pad2 = (n) => String(n).padStart(2, "0")

const brandName = () => process.env.RESEND_FROM_NAME?.trim() || "Gidtransfer"

/** RFC 5545 text escaping */
const escapeIcsText = (value) =>
    String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\n|\r/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")

/** Fold long lines at 75 octets (RFC 5545). */
const foldIcsLine = (line) => {
    if (line.length <= 75) return line

    const parts = [line.slice(0, 75)]
    let offset = 75
    while (offset < line.length) {
        parts.push(` ${line.slice(offset, offset + 74)}`)
        offset += 74
    }
    return parts.join("\r\n")
}

/** Local floating time — matches how bookings are parsed from date + time. */
const formatIcsLocalDateTime = (date) => {
    const value = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(value.getTime())) return null

    return (
        `${value.getFullYear()}${pad2(value.getMonth() + 1)}${pad2(value.getDate())}` +
        `T${pad2(value.getHours())}${pad2(value.getMinutes())}${pad2(value.getSeconds())}`
    )
}

const formatIcsUtcDateTime = (date = new Date()) => {
    const value = date instanceof Date ? date : new Date(date)
    return (
        `${value.getUTCFullYear()}${pad2(value.getUTCMonth() + 1)}${pad2(value.getUTCDate())}` +
        `T${pad2(value.getUTCHours())}${pad2(value.getUTCMinutes())}${pad2(value.getUTCSeconds())}Z`
    )
}

const defaultEndDate = (startsAt, endsAt) => {
    if (endsAt) {
        const end = endsAt instanceof Date ? endsAt : new Date(endsAt)
        if (!Number.isNaN(end.getTime())) return end
    }

    const start = startsAt instanceof Date ? startsAt : new Date(startsAt)
    return new Date(start.getTime() + 60 * 60 * 1000)
}

const displayClientName = (clientName, fallback = "Client") =>
    clientName?.trim() || fallback

const buildBookingEventFields = ({
    booking,
    client,
    studioName,
    actionUrl,
}) => {
    const startsAt = booking.startsAt instanceof Date ? booking.startsAt : new Date(booking.startsAt)
    const endsAt = defaultEndDate(startsAt, booking.endsAt)
    const dtStart = formatIcsLocalDateTime(startsAt)
    const dtEnd = formatIcsLocalDateTime(endsAt)

    if (!dtStart || !dtEnd) {
        return null
    }

    const clientLabel = displayClientName(client?.name)
    const summary = `${booking.title} — ${clientLabel}`
    const descriptionParts = [
        `Client: ${clientLabel}`,
        booking.description?.trim() ? booking.description.trim() : null,
        actionUrl ? `View booking: ${actionUrl}` : null,
    ].filter(Boolean)

    const amount = Number(booking.amountCharged ?? 0)
    if (amount > 0) {
        const currency = booking.currency?.trim() || "GHS"
        descriptionParts.splice(1, 0, `Amount: ${currency} ${amount.toLocaleString("en-GB")}`)
    }

    return {
        uid: `booking-${booking._id}@gidtransfer.com`,
        dtStart,
        dtEnd,
        summary,
        description: descriptionParts.join("\n"),
        location: booking.location?.trim() || "",
        organizerName: studioName?.trim() || brandName(),
        url: actionUrl || "",
    }
}

export const buildBookingIcs = ({
    booking,
    client,
    studioName,
    actionUrl,
}) => {
    const event = buildBookingEventFields({ booking, client, studioName, actionUrl })
    if (!event) return null

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//${escapeIcsText(brandName())}//Booking//EN`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${event.uid}`,
        `DTSTAMP:${formatIcsUtcDateTime()}`,
        `DTSTART:${event.dtStart}`,
        `DTEND:${event.dtEnd}`,
        `SUMMARY:${escapeIcsText(event.summary)}`,
        `DESCRIPTION:${escapeIcsText(event.description)}`,
        ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
        ...(event.url ? [`URL:${escapeIcsText(event.url)}`] : []),
        `ORGANIZER;CN=${escapeIcsText(event.organizerName)}:mailto:noreply@gidtransfer.com`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ]

    return `${lines.map(foldIcsLine).join("\r\n")}\r\n`
}

export const buildBookingIcsAttachment = (options) => {
    const content = buildBookingIcs(options)
    if (!content) return null

    const safeTitle = String(options.booking?.title ?? "booking")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 40)

    return {
        filename: `${safeTitle || "booking"}.ics`,
        content: Buffer.from(content, "utf8").toString("base64"),
        contentType: "text/calendar; charset=utf-8; method=PUBLISH",
    }
}

/** One-click add for Gmail / Google Calendar web. */
export const buildGoogleCalendarUrl = ({
    booking,
    client,
    studioName,
    actionUrl,
}) => {
    const event = buildBookingEventFields({ booking, client, studioName, actionUrl })
    if (!event) return null

    const formatGoogleDate = (icsLocal) => icsLocal

    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: event.summary,
        dates: `${formatGoogleDate(event.dtStart)}/${formatGoogleDate(event.dtEnd)}`,
        details: event.description,
    })

    if (event.location) params.set("location", event.location)
    if (event.url) params.set("sprop", `website:${event.url}`)

    return `https://calendar.google.com/calendar/render?${params.toString()}`
}
