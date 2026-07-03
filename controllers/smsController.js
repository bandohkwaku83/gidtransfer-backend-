import { arkeselConfigured } from "../services/arkeselSms.js"
import {
    ArkeselSmsError,
    defaultPlatformSmsSender,
    formatSmsSenderFields,
    sendStudioSms,
} from "../utils/studioSms.js"

const handleSmsError = (res, error) => {
    if (error instanceof ArkeselSmsError) {
        const status =
            error.code === "NOT_CONFIGURED" || error.code === "NO_SENDER"
                ? 503
                : error.code === "INVALID_PHONE"
                  ? 400
                  : 502
        return res.status(status).json({ message: error.message, code: error.code })
    }
    console.error("SMS error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const getSmsConfig = async (req, res) => {
    const studio = req.user.studio ?? {}

    return res.status(200).json({
        configured: arkeselConfigured(),
        defaultSender: defaultPlatformSmsSender() || null,
        studio: formatSmsSenderFields(studio),
    })
}

export const sendTestSms = async (req, res) => {
    try {
        const phone = req.body?.phone ?? req.body?.to ?? req.user.studio?.phone
        const message =
            req.body?.message?.trim() ||
            "This is a test SMS from Gidtransfer. Your studio SMS identity is working."

        if (!phone?.trim()) {
            return res.status(400).json({ message: "Phone number is required" })
        }

        const result = await sendStudioSms({
            studio: req.user.studio,
            to: phone,
            message,
        })

        return res.status(200).json({
            message: "Test SMS sent",
            sms: result,
        })
    } catch (error) {
        return handleSmsError(res, error)
    }
}
