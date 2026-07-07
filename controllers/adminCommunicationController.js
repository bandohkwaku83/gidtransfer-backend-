import AdminCommunication from "../models/AdminCommunication.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import {
    formatAdminCommunication,
    getAdminCommunicationConfig,
    handleAdminCommunicationError,
    parseAdminEmailInput,
    parseAdminSmsInput,
    resolveCommunicationUsers,
    sendAdminEmailToUsers,
    sendAdminSmsToUsers,
} from "../utils/adminCommunication.js"

const saveCommunicationLog = async ({
    admin,
    channel,
    subject = "",
    message,
    recipients,
    summary,
}) =>
    AdminCommunication.create({
        admin: admin._id,
        adminEmail: admin.email,
        channel,
        subject,
        message,
        recipients,
        summary,
    })

export const getCommunicationConfig = async (_req, res) => {
    return res.status(200).json(getAdminCommunicationConfig())
}

export const sendCommunicationSms = async (req, res) => {
    try {
        const { message, errors } = parseAdminSmsInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const users = await resolveCommunicationUsers(req.body)
        if (!users.length) {
            return res.status(400).json({ message: "No matching photographers found" })
        }

        const result = await sendAdminSmsToUsers({ users, message })
        const log = await saveCommunicationLog({
            admin: req.admin,
            channel: "sms",
            message,
            recipients: result.recipients,
            summary: result.summary,
        })

        return res.status(200).json({
            message: "SMS communication processed",
            communication: formatAdminCommunication(log),
        })
    } catch (error) {
        return handleAdminCommunicationError(res, error)
    }
}

export const sendCommunicationEmail = async (req, res) => {
    try {
        const { message, subject, errors } = parseAdminEmailInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const users = await resolveCommunicationUsers(req.body)
        if (!users.length) {
            return res.status(400).json({ message: "No matching photographers found" })
        }

        const result = await sendAdminEmailToUsers({ users, subject, message })
        const log = await saveCommunicationLog({
            admin: req.admin,
            channel: "email",
            subject,
            message,
            recipients: result.recipients,
            summary: result.summary,
        })

        return res.status(200).json({
            message: "Email communication processed",
            communication: formatAdminCommunication(log),
        })
    } catch (error) {
        return handleAdminCommunicationError(res, error)
    }
}

export const sendPhotographerCommunication = async (req, res) => {
    try {
        const body = {
            ...req.body,
            userId: req.params.userId,
        }
        const channels = Array.isArray(body.channels)
            ? body.channels.map((value) => String(value).trim().toLowerCase())
            : [String(body.channel ?? "both").trim().toLowerCase()]

        const sendSms =
            channels.includes("sms") || channels.includes("both")
        const sendEmailChannel =
            channels.includes("email") || channels.includes("both")

        if (!sendSms && !sendEmailChannel) {
            return res.status(400).json({
                message: 'channels must include "sms", "email", or "both"',
            })
        }

        const results = {}

        if (sendSms) {
            const { message, errors } = parseAdminSmsInput(body)
            if (errors.length) {
                return res.status(400).json({ message: errors[0] })
            }
            const users = await resolveCommunicationUsers(body)
            if (!users.length) {
                return res.status(404).json({ message: "Photographer not found" })
            }
            const smsResult = await sendAdminSmsToUsers({ users, message })
            results.sms = formatAdminCommunication(
                await saveCommunicationLog({
                    admin: req.admin,
                    channel: "sms",
                    message,
                    recipients: smsResult.recipients,
                    summary: smsResult.summary,
                })
            )
        }

        if (sendEmailChannel) {
            const { message, subject, errors } = parseAdminEmailInput(body)
            if (errors.length) {
                return res.status(400).json({ message: errors[0] })
            }
            const users = await resolveCommunicationUsers(body)
            if (!users.length) {
                return res.status(404).json({ message: "Photographer not found" })
            }
            const emailResult = await sendAdminEmailToUsers({
                users,
                subject,
                message,
            })
            results.email = formatAdminCommunication(
                await saveCommunicationLog({
                    admin: req.admin,
                    channel: "email",
                    subject,
                    message,
                    recipients: emailResult.recipients,
                    summary: emailResult.summary,
                })
            )
        }

        return res.status(200).json({
            message: "Communication processed",
            results,
        })
    } catch (error) {
        return handleAdminCommunicationError(res, error)
    }
}

export const listCommunications = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = {}

        const channel = String(req.query.channel ?? "").trim()
        if (channel === "sms" || channel === "email") {
            filter.channel = channel
        }

        const userId = String(req.query.userId ?? "").trim()
        if (userId) {
            filter["recipients.userId"] = userId
        }

        const [total, rows] = await Promise.all([
            AdminCommunication.countDocuments(filter),
            paginatedQuery(
                AdminCommunication.find(filter).sort({ createdAt: -1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            items: rows.map(formatAdminCommunication),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listCommunications:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
