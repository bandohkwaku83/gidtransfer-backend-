import {
    ArkeselSmsError,
    buildGalleryShareSmsMessage,
    sendStudioSms,
} from "./studioSms.js"
import { buildGalleryClientUrl } from "./galleryShareUrl.js"

const httpUrl = (value) => {
    const raw = typeof value === "string" ? value.trim() : ""
    if (!raw) return null
    try {
        const url = new URL(raw)
        if (url.protocol !== "http:" && url.protocol !== "https:") return null
        return url
    } catch {
        return null
    }
}

/** Accept a caller URL only when it is this gallery's client link. */
export const shareUrlForGallery = (gallery, requestedShareUrl) => {
    const slug = gallery?.slug?.trim()
    const url = httpUrl(requestedShareUrl)
    if (!slug || !url) return null

    const path = url.pathname.replace(/\/+$/, "") || "/"
    if (path !== `/client/${slug}`) return null
    return url.toString()
}

export const resolveGalleryNotifyShareUrl = ({
    gallery,
    companySlug,
    requestedShareUrl,
}) =>
    buildGalleryClientUrl(companySlug, gallery?.slug) ||
    shareUrlForGallery(gallery, requestedShareUrl) ||
    null

/** Keep the client link in the SMS even when a custom message omits it. */
export const messageWithGalleryLink = (message, shareUrl) => {
    const text = String(message ?? "").trim()
    const link = String(shareUrl ?? "").trim()
    if (!link) return text
    if (text.includes(link)) return text
    if (!text) return link
    return `${text}\n${link}`
}

export const notifyClientGalleryShareSms = async ({
    gallery,
    ownerStudio,
    companySlug,
    customMessage,
    shareUrl: requestedShareUrl,
}) => {
    const client = gallery.client
    const phone = client?.phone
    if (!phone?.trim()) {
        throw new ArkeselSmsError("Client has no phone number for SMS", {
            code: "MISSING_CLIENT_PHONE",
        })
    }

    const shareUrl = resolveGalleryNotifyShareUrl({
        gallery,
        companySlug,
        requestedShareUrl,
    })
    if (!shareUrl) {
        throw new ArkeselSmsError("Gallery share URL is not available", {
            code: "MISSING_SHARE_URL",
        })
    }

    const message = messageWithGalleryLink(
        customMessage?.trim() ||
            buildGalleryShareSmsMessage({
                studioName: ownerStudio?.companyName,
                galleryName: gallery.name,
                shareUrl,
            }),
        shareUrl,
    )

    return sendStudioSms({
        studio: ownerStudio,
        to: phone,
        message,
    })
}

export const mapGallerySmsError = (error) => {
    if (!(error instanceof ArkeselSmsError)) {
        return { status: 500, message: "Server error" }
    }

    const statusByCode = {
        MISSING_CLIENT_PHONE: 400,
        MISSING_SHARE_URL: 400,
        INVALID_PHONE: 400,
        NOT_CONFIGURED: 503,
        NO_SENDER: 503,
    }

    return {
        status: statusByCode[error.code] || 502,
        message: error.message,
        code: error.code,
    }
}
