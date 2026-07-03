import {
    resendConfigured,
    sendEmail,
    ResendEmailError,
} from "../services/resendEmail.js"
import { formatEmailNotificationsResponse } from "../utils/emailNotificationFields.js"
import {
    hasLocalEmailLogo,
    findLocalEmailLogoPath,
    getEmailLogoSrc,
    testNotificationEmail,
} from "../utils/emailTemplates.js"

const handleEmailError = (res, error) => {
    if (error instanceof ResendEmailError) {
        const status = error.code === "NOT_CONFIGURED" ? 503 : 502
        return res.status(status).json({ message: error.message, code: error.code })
    }
    console.error("Email error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const getEmailConfig = async (req, res) => {
    return res.status(200).json({
        configured: resendConfigured(),
        notifications: formatEmailNotificationsResponse(req.user),
        emailLogoConfigured: hasLocalEmailLogo(),
        emailLogoPath: findLocalEmailLogoPath(),
        emailLogoSrc: getEmailLogoSrc(),
    })
}

export const sendTestEmail = async (req, res) => {
    try {
        const to = req.body?.to ?? req.body?.email ?? req.user.email
        if (!to?.trim()) {
            return res.status(400).json({ message: "Email address is required" })
        }

        const studioName = req.user.studio?.companyName?.trim() || "there"
        const payload = testNotificationEmail({ studioName })
        const result = await sendEmail({
            to,
            ...payload,
        })

        return res.status(200).json({
            message: "Test email sent",
            email: { to, result },
        })
    } catch (error) {
        return handleEmailError(res, error)
    }
}
