import User from "../models/User.js"
import { notifyPlanRenewalReminder } from "../utils/photographerBillingNotify.js"

const MS_HOUR = 60 * 60 * 1000
const MS_DAY = 24 * MS_HOUR

const checkIntervalHours = () => {
    const raw = Number(process.env.BILLING_RENEWAL_REMINDER_CHECK_HOURS ?? 6)
    return Number.isFinite(raw) && raw > 0 ? Math.max(1, raw) : 6
}

const checkIntervalMs = () => checkIntervalHours() * MS_HOUR

const reminderDaysBefore = () => {
    const raw = Number(process.env.BILLING_RENEWAL_REMINDER_DAYS_BEFORE ?? 5)
    return Number.isFinite(raw) && raw > 0 ? raw : 5
}

/** Half the poll interval, at least 3 hours — avoids missing the window. */
const reminderToleranceMs = () =>
    Math.max(checkIntervalMs() / 2, 3 * MS_HOUR)

const sameInstant = (a, b) => {
    if (!a || !b) return false
    return new Date(a).getTime() === new Date(b).getTime()
}

const buildDueRenewalQuery = (now) => {
    const leadMs = reminderDaysBefore() * MS_DAY
    const tolerance = reminderToleranceMs()

    return {
        isActive: true,
        "subscription.planId": { $nin: ["free", null, ""] },
        "subscription.status": "active",
        "subscription.cancelAtPeriodEnd": { $ne: true },
        "subscription.currentPeriodEnd": {
            $gte: new Date(now.getTime() + leadMs - tolerance),
            $lte: new Date(now.getTime() + leadMs + tolerance),
        },
    }
}

/** Email + SMS when a paid plan is ~5 days from renewal / period end. */
export const sendDueSubscriptionRenewalReminders = async () => {
    const now = new Date()
    const daysLeft = reminderDaysBefore()
    const users = await User.find(buildDueRenewalQuery(now))
        .select(
            "email studio emailNotifications isActive subscription"
        )
        .limit(200)
        .exec()

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const user of users) {
        const periodEnd = user.subscription?.currentPeriodEnd
        if (
            periodEnd &&
            sameInstant(user.subscription?.renewalReminderPeriodEnd, periodEnd)
        ) {
            skipped += 1
            continue
        }

        try {
            const result = await notifyPlanRenewalReminder(user, { daysLeft })
            const didNotify = result?.email?.sent || result?.sms?.sent

            if (didNotify) {
                user.subscription = user.subscription ?? {}
                user.subscription.renewalReminderPeriodEnd = periodEnd
                user.subscription.renewalReminderSentAt = new Date()
                await user.save()
                sent += 1
            } else {
                skipped += 1
            }
        } catch (error) {
            failed += 1
            console.error(
                `[billing] renewal reminder failed for ${user._id}:`,
                error.message
            )
        }
    }

    return {
        checked: users.length,
        sent,
        skipped,
        failed,
        daysLeft,
    }
}

export const startSubscriptionRenewalReminderScheduler = () => {
    const intervalMs = checkIntervalMs()

    const run = async () => {
        try {
            const result = await sendDueSubscriptionRenewalReminders()
            if (result.sent > 0 || result.failed > 0) {
                console.log(
                    `[billing] renewal reminders (${result.daysLeft}d) — sent ${result.sent}, skipped ${result.skipped}, failed ${result.failed}`
                )
            }
        } catch (error) {
            console.error(
                "[billing] renewal reminder job failed:",
                error.message
            )
        }
    }

    // Kick once shortly after boot, then on interval.
    setTimeout(run, 20_000)
    return setInterval(run, intervalMs)
}
