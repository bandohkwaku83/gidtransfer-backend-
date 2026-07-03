const DEFAULT_SEND_URL = "https://sms.arkesel.com/api/v2/sms/send"

export class ArkeselSmsError extends Error {
    constructor(message, { code, status, details } = {}) {
        super(message)
        this.name = "ArkeselSmsError"
        this.code = code
        this.status = status
        this.details = details
    }
}

export const arkeselConfigured = () => Boolean(process.env.ARKESEL_API_KEY?.trim())

export const arkeselDryRun = () =>
    process.env.ARKESEL_SMS_DRY_RUN === "1" ||
    process.env.ARKESEL_SMS_DRY_RUN === "true"

const parseArkeselResponse = async (response) => {
    const text = await response.text()
    let body = null
    if (text) {
        try {
            body = JSON.parse(text)
        } catch {
            body = { raw: text }
        }
    }
    return body
}

/**
 * Send one SMS via Arkesel v2 API.
 * @see https://developers.arkesel.com/
 */
export const sendArkeselSms = async ({ sender, message, recipients }) => {
    const apiKey = process.env.ARKESEL_API_KEY?.trim()
    const toList = (Array.isArray(recipients) ? recipients : [recipients])
        .map((n) => String(n).trim())
        .filter(Boolean)

    if (!sender?.trim()) {
        throw new ArkeselSmsError("SMS sender ID is required", {
            code: "MISSING_SENDER",
        })
    }
    if (!message?.trim()) {
        throw new ArkeselSmsError("SMS message is required", {
            code: "MISSING_MESSAGE",
        })
    }
    if (!toList.length) {
        throw new ArkeselSmsError("At least one recipient is required", {
            code: "MISSING_RECIPIENT",
        })
    }

    if (!apiKey) {
        if (process.env.NODE_ENV !== "production") {
            console.log("[sms:dry-run] ARKESEL_API_KEY missing — logged only:", {
                sender,
                message,
                recipients: toList,
            })
            return {
                dryRun: true,
                sender,
                message,
                recipients: toList,
            }
        }
        throw new ArkeselSmsError("SMS is not configured", {
            code: "NOT_CONFIGURED",
        })
    }

    if (arkeselDryRun()) {
        console.log("[sms:dry-run]", { sender, message, recipients: toList })
        return {
            dryRun: true,
            sender,
            message,
            recipients: toList,
        }
    }

    const url = (process.env.ARKESEL_API_URL || DEFAULT_SEND_URL).trim()
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify({
            sender: sender.trim(),
            message: message.trim(),
            recipients: toList,
        }),
    })

    const body = await parseArkeselResponse(response)
    if (!response.ok) {
        const messageText =
            body?.message ||
            body?.error ||
            `Arkesel SMS request failed (${response.status})`
        throw new ArkeselSmsError(messageText, {
            code: "ARKesel_HTTP_ERROR",
            status: response.status,
            details: body,
        })
    }

    return body
}
