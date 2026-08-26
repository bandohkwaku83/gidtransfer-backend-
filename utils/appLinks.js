import { appBaseUrl } from "./studioUrl.js"
import { buildStudioUrl } from "./galleryShareUrl.js"

/** Photographer dashboard base — tenant subdomain when slug is known. */
export const photographerAppBase = (companySlug) =>
    buildStudioUrl(companySlug) || appBaseUrl()

export const bookingDetailUrl = (bookingId, companySlug) =>
    `${photographerAppBase(companySlug)}/bookings/${bookingId}`

export const galleryDetailUrl = (galleryId, companySlug) =>
    `${photographerAppBase(companySlug)}/galleries/${galleryId}`

export const dashboardUrl = (companySlug) =>
    `${photographerAppBase(companySlug)}/dashboard`

export const billingUrl = (companySlug) =>
    `${photographerAppBase(companySlug)}/billing`

/** Accept a collaboration invite (token is the raw invite token). */
export const collaborationInviteUrl = (token, companySlug) =>
    `${photographerAppBase(companySlug)}/collaborations/invites/${encodeURIComponent(token)}`
