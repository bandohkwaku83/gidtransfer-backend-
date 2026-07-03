import {
    ArkeselSmsError,
    buildGalleryShareSmsMessage,
    sendStudioSms,
} from "./studioSms.js"
import { buildGalleryClientUrl } from "./galleryShareUrl.js"

export const notifyClientGalleryShareSms = async ({
    gallery,
    ownerStudio,
    companySlug,
    customMessage,
}) => {
    const client = gallery.client
    const phone = client?.phone
    if (!phone?.trim()) {
        throw new ArkeselSmsError("Client has no phone number for SMS", {
            code: "MISSING_CLIENT_PHONE",
        })
    }

    const shareUrl =
        buildGalleryClientUrl(companySlug, gallery.slug) ||
        gallery.shareUrl ||
        null
    if (!shareUrl) {
        throw new ArkeselSmsError("Gallery share URL is not available", {
            code: "MISSING_SHARE_URL",
        })
    }

    const message =
        customMessage?.trim() ||
        buildGalleryShareSmsMessage({
            studioName: ownerStudio?.companyName,
            galleryName: gallery.name,
            shareUrl,
        })

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
