import { Resend } from "resend"
import {
    EMAIL_LOGO_CID,
    emailLogoUsesCidAttachment,
    getEmailLogoAttachment,
} from "../utils/emailTemplates.js"

export class ResendEmailError extends Error {
    constructor(message, { code, details } = {}) {
        super(message)
        this.name = "ResendEmailError"
        this.code = code
        this.details = details
    }
}

export const resendConfigured = () => Boolean(process.env.RESEND_API_KEY?.trim())

export const resendDryRun = () =>
    process.env.RESEND_EMAIL_DRY_RUN === "1" ||
    process.env.RESEND_EMAIL_DRY_RUN === "true"

export const defaultFromEmail = () => {
    const from = process.env.RESEND_FROM_EMAIL?.trim()
    if (from) return from
    const name = process.env.RESEND_FROM_NAME?.trim() || "Gidtransfer"
    return `${name} <onboarding@resend.dev>`
}

let client = null

const getClient = () => {
    if (!client) {
        client = new Resend(process.env.RESEND_API_KEY?.trim())
    }
    return client
}

export const sendEmail = async ({
    to,
    subject,
    html,
    text,
    replyTo,
    attachments = [],
    /** Auth/transactional mail (OTP, password reset) bypasses RESEND_EMAIL_DRY_RUN. */
    transactional = false,
}) => {
    const recipients = (Array.isArray(to) ? to : [to])
        .map((value) => String(value).trim())
        .filter(Boolean)

    if (!recipients.length) {
        throw new ResendEmailError("At least one recipient is required", {
            code: "MISSING_RECIPIENT",
        })
    }
    if (!subject?.trim()) {
        throw new ResendEmailError("Email subject is required", {
            code: "MISSING_SUBJECT",
        })
    }
    if (!html?.trim() && !text?.trim()) {
        throw new ResendEmailError("Email body is required", {
            code: "MISSING_BODY",
        })
    }

    const apiKey = process.env.RESEND_API_KEY?.trim()
    if (!apiKey) {
        if (process.env.NODE_ENV !== "production") {
            console.log("[email:dry-run] RESEND_API_KEY missing — logged only:", {
                to: recipients,
                subject,
                text: text || html?.slice(0, 200),
            })
            return { dryRun: true, to: recipients, subject }
        }
        throw new ResendEmailError("Email is not configured", {
            code: "NOT_CONFIGURED",
        })
    }

    if (!transactional && resendDryRun()) {
        const logo = getEmailLogoAttachment()
        console.log("[email:dry-run]", {
            to: recipients,
            subject,
            logo: logo?.filename ?? "none",
        })
        return { dryRun: true, to: recipients, subject }
    }

    const mergedAttachments = [...attachments]
    const logoAttachment = getEmailLogoAttachment()
    if (
        logoAttachment &&
        emailLogoUsesCidAttachment() &&
        html?.includes(`cid:${EMAIL_LOGO_CID}`) &&
        !mergedAttachments.some((item) => item.contentId === EMAIL_LOGO_CID)
    ) {
        mergedAttachments.push(logoAttachment)
    }

    const { data, error } = await getClient().emails.send({
        from: defaultFromEmail(),
        to: recipients,
        subject: subject.trim(),
        html: html?.trim() || undefined,
        text: text?.trim() || undefined,
        replyTo: replyTo?.trim() || undefined,
        attachments: mergedAttachments.length ? mergedAttachments : undefined,
    })

    if (error) {
        throw new ResendEmailError(error.message || "Resend request failed", {
            code: "RESEND_API_ERROR",
            details: error,
        })
    }

    return data
}
