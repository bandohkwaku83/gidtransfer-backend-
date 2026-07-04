import User from "../models/User.js"
import { sendEmail, ResendEmailError, resendConfigured } from "../services/resendEmail.js"
import {
    bookingConfirmationEmail,
    bookingReminderEmail,
    galleryClientCommentEmail,
    galleryFinalFlaggedEmail,
    gallerySelectionsSubmittedEmail,
    passwordResetEmail,
    emailVerificationOtpEmail,
} from "./emailTemplates.js"
import {
    bookingDetailUrl,
    galleryDetailUrl,
} from "./appLinks.js"
import { photographerWantsEmail } from "./emailNotificationFields.js"
import {
    buildBookingIcs,
    buildBookingIcsAttachment,
    buildGoogleCalendarUrl,
} from "./bookingCalendar.js"

export { ResendEmailError }

const emailsGloballyEnabled = () =>
    process.env.EMAIL_NOTIFICATIONS_ENABLED !== "false" &&
    process.env.EMAIL_NOTIFICATIONS_ENABLED !== "0"

const formatDateTime = (date, timeZone) => {
    const value = date instanceof Date ? date : new Date(date)
    return value.toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: timeZone || undefined,
    })
}

const formatBookingAmount = (booking) => {
    const amount = Number(booking?.amountCharged ?? 0)
    if (!amount) return null
    const currency = booking?.currency?.trim() || "GHS"
    return `${currency} ${amount.toLocaleString("en-GB")}`
}

const loadPhotographer = async (ownerId) => {
    if (!ownerId) return null
    return User.findById(ownerId).select("email studio emailNotifications isActive")
}

const buildBookingCalendarPayload = ({ booking, client, studioName, actionUrl }) => {
    const calendarOptions = { booking, client, studioName, actionUrl }
    return {
        calendarUrl: buildGoogleCalendarUrl(calendarOptions),
        attachment: buildBookingIcsAttachment(calendarOptions),
    }
}

const sendToPhotographer = async (user, kind, buildMessage) => {
    if (!emailsGloballyEnabled()) return { skipped: true, reason: "disabled_globally" }
    if (!user?.isActive) return { skipped: true, reason: "inactive_user" }
    if (!user.email?.trim()) return { skipped: true, reason: "missing_email" }
    if (!photographerWantsEmail(user, kind)) {
        return { skipped: true, reason: "preference_disabled" }
    }

    const message = buildMessage(user)
    const result = await sendEmail({
        to: user.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: message.attachments ?? [],
    })
    return { sent: true, to: user.email, result }
}

export const queuePhotographerEmail = (promise) => {
    promise.catch((error) => {
        console.error("[email] notification failed:", error.message)
    })
}

export const notifyPhotographerBookingConfirmation = async ({
    ownerId,
    booking,
    client,
}) => {
    const user = await loadPhotographer(ownerId)
    const companySlug = user?.studio?.companySlug
    const studioName = user?.studio?.companyName?.trim() || "there"
    const actionUrl = bookingDetailUrl(booking._id, companySlug)
    const { calendarUrl, attachment } = buildBookingCalendarPayload({
        booking,
        client,
        studioName,
        actionUrl,
    })
    const payload = bookingConfirmationEmail({
        studioName,
        bookingTitle: booking.title,
        clientName: client?.name,
        startsAtLabel: formatDateTime(booking.startsAt),
        location: booking.location,
        amountLabel: formatBookingAmount(booking),
        calendarUrl,
    })

    return sendToPhotographer(user, "booking_confirmation", () => ({
        ...payload,
        attachments: attachment ? [attachment] : [],
    }))
}

export const notifyPhotographerBookingReminder = async ({
    ownerId,
    user: preloadedUser,
    booking,
    client,
    reminderType = "day",
}) => {
    const user = preloadedUser ?? (await loadPhotographer(ownerId))
    const companySlug = user?.studio?.companySlug
    const studioName = user?.studio?.companyName?.trim() || "there"
    const actionUrl = bookingDetailUrl(booking._id, companySlug)
    const { calendarUrl, attachment } = buildBookingCalendarPayload({
        booking,
        client,
        studioName,
        actionUrl,
    })
    const payload = bookingReminderEmail({
        studioName,
        bookingTitle: booking.title,
        clientName: client?.name,
        startsAtLabel: formatDateTime(booking.startsAt),
        location: booking.location,
        calendarUrl,
        reminderType,
    })

    return sendToPhotographer(user, "booking_reminder", () => ({
        ...payload,
        attachments: attachment ? [attachment] : [],
    }))
}

export const notifyPhotographerGalleryComment = async ({
    ownerId,
    gallery,
    clientName,
    comment,
}) => {
    const user = await loadPhotographer(ownerId)
    const companySlug = user?.studio?.companySlug
    const studioName = user?.studio?.companyName?.trim() || "there"
    const payload = galleryClientCommentEmail({
        studioName,
        galleryName: gallery.name,
        clientName,
        comment,
        actionUrl: galleryDetailUrl(gallery._id, companySlug),
    })

    return sendToPhotographer(user, "gallery_comment", () => payload)
}

export const notifyPhotographerFinalFlagged = async ({
    ownerId,
    gallery,
    clientName,
    comment,
}) => {
    const user = await loadPhotographer(ownerId)
    const companySlug = user?.studio?.companySlug
    const studioName = user?.studio?.companyName?.trim() || "there"
    const payload = galleryFinalFlaggedEmail({
        studioName,
        galleryName: gallery.name,
        clientName,
        comment,
        actionUrl: galleryDetailUrl(gallery._id, companySlug),
    })

    return sendToPhotographer(user, "gallery_flag", () => payload)
}

export const notifyPhotographerSelectionsSubmitted = async ({
    ownerId,
    gallery,
    clientName,
    selectionCount,
}) => {
    const user = await loadPhotographer(ownerId)
    const companySlug = user?.studio?.companySlug
    const studioName = user?.studio?.companyName?.trim() || "there"
    const payload = gallerySelectionsSubmittedEmail({
        studioName,
        galleryName: gallery.name,
        clientName,
        selectionCount,
        actionUrl: galleryDetailUrl(gallery._id, companySlug),
    })

    return sendToPhotographer(user, "gallery_selections", () => payload)
}

export const sendPasswordResetEmail = async ({ email, resetUrl }) => {
    const payload = passwordResetEmail({ resetUrl })

    if (!resendConfigured()) {
        console.log(`[password-reset] ${email}: ${resetUrl}`)
        return { dryRun: true }
    }

    return sendEmail({ to: email, ...payload, transactional: true })
}

export const sendEmailVerificationOtp = async ({ email, code }) => {
    const payload = emailVerificationOtpEmail({ code })

    if (!resendConfigured()) {
        console.log(`[email-verification] ${email}: ${code}`)
        return { dryRun: true }
    }

    return sendEmail({ to: email, ...payload, transactional: true })
}
