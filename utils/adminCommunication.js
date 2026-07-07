import mongoose from "mongoose"
import User from "../models/User.js"
import { buildPhotographerListFilter } from "./adminPhotographerFields.js"
import { sendArkeselSms, ArkeselSmsError } from "../services/arkeselSms.js"
import { sendEmail, ResendEmailError } from "../services/resendEmail.js"
import { arkeselConfigured } from "../services/arkeselSms.js"
import { resendConfigured } from "../services/resendEmail.js"
import { defaultPlatformSmsSender } from "./studioSms.js"
import { normalizePhoneForSms } from "./phoneNumber.js"
import { adminPlatformMessageEmail } from "./emailTemplates.js"

const MAX_SMS_LENGTH = 480
const MAX_EMAIL_MESSAGE_LENGTH = 10_000
const MAX_SUBJECT_LENGTH = 200

const uniqueObjectIds = (values = []) => {
    const seen = new Set()
    const ids = []

    for (const value of values) {
        const raw = String(value ?? "").trim()
        if (!raw || !mongoose.isValidObjectId(raw) || seen.has(raw)) continue
        seen.add(raw)
        ids.push(new mongoose.Types.ObjectId(raw))
    }

    return ids
}

export const getAdminCommunicationConfig = () => ({
    sms: {
        configured: arkeselConfigured(),
        defaultSender: defaultPlatformSmsSender() || null,
    },
    email: {
        configured: resendConfigured(),
    },
    limits: {
        maxRecipients: null,
        maxSmsLength: MAX_SMS_LENGTH,
        maxEmailMessageLength: MAX_EMAIL_MESSAGE_LENGTH,
        maxSubjectLength: MAX_SUBJECT_LENGTH,
    },
})

export const resolveCommunicationUsers = async (body = {}) => {
    const explicitIds = uniqueObjectIds([
        ...(Array.isArray(body.userIds) ? body.userIds : []),
        body.userId,
    ])

    let users = []

    if (explicitIds.length) {
        users = await User.find({
            _id: { $in: explicitIds },
            isActive: true,
        })
            .select("email accountId studio")
            .lean()
    } else if (body.filter && typeof body.filter === "object") {
        const filter = {
            isActive: true,
            ...buildPhotographerListFilter(body.filter),
        }
        users = await User.find(filter).select("email accountId studio").lean()
    }

    return users
}

const buildRecipientBase = (user) => {
    const studio = user.studio ?? {}
    return {
        userId: user._id,
        accountId: user.accountId?.trim() || "",
        email: user.email?.trim() || "",
        phone: studio.phone?.trim() || "",
        companyName: studio.companyName?.trim() || "",
    }
}

const summarizeRecipients = (recipients) => ({
    targeted: recipients.length,
    sent: recipients.filter((row) => row.status === "sent").length,
    failed: recipients.filter((row) => row.status === "failed").length,
    skipped: recipients.filter((row) => row.status === "skipped").length,
})

export const parseAdminSmsInput = (body = {}) => {
    const message = String(body.message ?? body.body ?? "").trim()
    const errors = []

    if (!message) errors.push("message is required")
    if (message.length > MAX_SMS_LENGTH) {
        errors.push(`message must be ${MAX_SMS_LENGTH} characters or fewer`)
    }

    const hasTargets =
        body.userId ||
        (Array.isArray(body.userIds) && body.userIds.length) ||
        (body.filter && typeof body.filter === "object")

    if (!hasTargets) {
        errors.push("Provide userId, userIds, or filter to choose recipients")
    }

    return { message, errors }
}

export const parseAdminEmailInput = (body = {}) => {
    const message = String(body.message ?? body.body ?? "").trim()
    const subject = String(body.subject ?? "").trim()
    const errors = []

    if (!subject) errors.push("subject is required")
    if (subject.length > MAX_SUBJECT_LENGTH) {
        errors.push(`subject must be ${MAX_SUBJECT_LENGTH} characters or fewer`)
    }
    if (!message) errors.push("message is required")
    if (message.length > MAX_EMAIL_MESSAGE_LENGTH) {
        errors.push(
            `message must be ${MAX_EMAIL_MESSAGE_LENGTH} characters or fewer`
        )
    }

    const hasTargets =
        body.userId ||
        (Array.isArray(body.userIds) && body.userIds.length) ||
        (body.filter && typeof body.filter === "object")

    if (!hasTargets) {
        errors.push("Provide userId, userIds, or filter to choose recipients")
    }

    return { message, subject, errors }
}

export const sendAdminSmsToUsers = async ({ users, message }) => {
    const sender = defaultPlatformSmsSender()
    if (!sender) {
        throw new ArkeselSmsError(
            "Platform SMS sender is not configured (ARKESEL_DEFAULT_SENDER)",
            { code: "NO_SENDER" }
        )
    }

    const recipients = []

    for (const user of users) {
        const base = buildRecipientBase(user)
        const phone = normalizePhoneForSms(base.phone)

        if (!phone) {
            recipients.push({
                ...base,
                status: "skipped",
                skipReason: "No valid studio phone number",
            })
            continue
        }

        try {
            const result = await sendArkeselSms({
                sender,
                message,
                recipients: [phone],
            })
            recipients.push({
                ...base,
                phone,
                status: "sent",
                ...(result?.dryRun ? { dryRun: true } : {}),
            })
        } catch (error) {
            recipients.push({
                ...base,
                phone,
                status: "failed",
                error: error.message || "SMS failed",
            })
        }
    }

    return {
        sender,
        message,
        recipients,
        summary: summarizeRecipients(recipients),
    }
}

export const sendAdminEmailToUsers = async ({ users, subject, message }) => {
    const recipients = []

    for (const user of users) {
        const base = buildRecipientBase(user)
        const to = base.email

        if (!to) {
            recipients.push({
                ...base,
                status: "skipped",
                skipReason: "No email address",
            })
            continue
        }

        const recipientName = base.companyName || to
        const payload = adminPlatformMessageEmail({
            recipientName,
            subject,
            message,
        })

        try {
            const result = await sendEmail({
                to,
                subject: payload.subject,
                html: payload.html,
                text: payload.text,
            })
            recipients.push({
                ...base,
                status: "sent",
                ...(result?.dryRun ? { dryRun: true } : {}),
            })
        } catch (error) {
            recipients.push({
                ...base,
                status: "failed",
                error: error.message || "Email failed",
            })
        }
    }

    return {
        subject,
        message,
        recipients,
        summary: summarizeRecipients(recipients),
    }
}

export const formatAdminCommunication = (doc) => {
    const row = doc.toJSON ? doc.toJSON() : doc

    return {
        id: String(row._id),
        channel: row.channel,
        subject: row.subject?.trim() || null,
        message: row.message,
        adminEmail: row.adminEmail,
        summary: row.summary ?? summarizeRecipients(row.recipients ?? []),
        recipients: (row.recipients ?? []).map((recipient) => ({
            userId: recipient.userId,
            accountId: recipient.accountId || null,
            email: recipient.email || null,
            phone: recipient.phone || null,
            companyName: recipient.companyName || "",
            status: recipient.status,
            error: recipient.error?.trim() || null,
            skipReason: recipient.skipReason?.trim() || null,
        })),
        createdAt: row.createdAt,
    }
}

export const handleAdminCommunicationError = (res, error) => {
    if (error instanceof ArkeselSmsError || error instanceof ResendEmailError) {
        const status =
            error.code === "NOT_CONFIGURED" || error.code === "NO_SENDER"
                ? 503
                : 502
        return res.status(status).json({ message: error.message, code: error.code })
    }
    console.error("Admin communication error:", error)
    return res.status(500).json({ message: "Server error" })
}
