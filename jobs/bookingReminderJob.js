import Booking from "../models/Booking.js"
import {
    notifyPhotographerBookingReminder,
    queuePhotographerEmail,
} from "../utils/photographerNotifications.js"

const MS_HOUR = 60 * 60 * 1000

const checkIntervalMinutes = () => {
    const raw = Number(process.env.BOOKING_REMINDER_CHECK_MINUTES ?? 15)
    return Number.isFinite(raw) && raw > 0 ? Math.max(5, raw) : 15
}

const checkIntervalMs = () => checkIntervalMinutes() * MS_HOUR / 60

/** Half the poll interval, at least 5 minutes — avoids missing the reminder window. */
const reminderToleranceMs = () =>
    Math.max(checkIntervalMs() / 2, 5 * 60 * 1000)

const reminderLeadHours = (envKey, fallbackHours) => {
    const raw = Number(process.env[envKey] ?? fallbackHours)
    return Number.isFinite(raw) && raw > 0 ? raw : fallbackHours
}

const REMINDER_SCHEDULES = [
    {
        type: "day",
        leadHours: () => reminderLeadHours("BOOKING_DAY_REMINDER_HOURS_BEFORE", 24),
        sentAtField: "dayReminderEmailSentAt",
    },
    {
        type: "hour",
        leadHours: () => reminderLeadHours("BOOKING_HOUR_REMINDER_HOURS_BEFORE", 1),
        sentAtField: "hourReminderEmailSentAt",
    },
]

const buildDueReminderQuery = (now, { leadHours, sentAtField }) => {
    const leadMs = leadHours() * MS_HOUR
    const tolerance = reminderToleranceMs()

    return {
        startsAt: {
            $gt: now,
            $gte: new Date(now.getTime() + leadMs - tolerance),
            $lte: new Date(now.getTime() + leadMs + tolerance),
        },
        [sentAtField]: null,
    }
}

const processReminderSchedule = async (now, schedule) => {
    const bookings = await Booking.find(buildDueReminderQuery(now, schedule))
        .populate({ path: "client", select: "name email phone" })
        .sort({ startsAt: 1 })
        .limit(100)
        .exec()

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const booking of bookings) {
        try {
            const result = await notifyPhotographerBookingReminder({
                ownerId: booking.owner,
                booking,
                client: booking.client,
                reminderType: schedule.type,
            })

            if (result?.sent) {
                booking[schedule.sentAtField] = new Date()
                await booking.save()
                sent += 1
            } else {
                skipped += 1
            }
        } catch (error) {
            failed += 1
            console.error(
                `[email] booking ${schedule.type} reminder failed for ${booking._id}:`,
                error.message
            )
        }
    }

    return { checked: bookings.length, sent, skipped, failed }
}

/** Send 1-day and 1-hour pre-shoot reminder emails when each window is due. */
export const sendDueBookingReminderEmails = async () => {
    const now = new Date()
    const totals = { checked: 0, sent: 0, skipped: 0, failed: 0 }
    const byType = {}

    for (const schedule of REMINDER_SCHEDULES) {
        const result = await processReminderSchedule(now, schedule)
        byType[schedule.type] = result
        totals.checked += result.checked
        totals.sent += result.sent
        totals.skipped += result.skipped
        totals.failed += result.failed
    }

    return { ...totals, byType }
}

export const startBookingReminderScheduler = () => {
    const intervalMs = checkIntervalMs()

    const run = async () => {
        try {
            const result = await sendDueBookingReminderEmails()
            if (result.sent > 0 || result.failed > 0) {
                const day = result.byType?.day
                const hour = result.byType?.hour
                console.log(
                    `[email] booking reminders — sent ${result.sent} (day ${day?.sent ?? 0}, hour ${hour?.sent ?? 0}), skipped ${result.skipped}, failed ${result.failed}`
                )
            }
        } catch (error) {
            console.error("[email] booking reminder job failed:", error.message)
        }
    }

    queuePhotographerEmail(run())
    return setInterval(run, intervalMs)
}
