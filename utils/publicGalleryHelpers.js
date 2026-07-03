import Gallery from "../models/Gallery.js"
import User from "../models/User.js"
import { computeShareActive } from "./galleryFields.js"
import {
    extractGalleryAccessToken,
    hasGalleryEmailToken,
    hasGalleryPasswordToken,
    verifyGalleryAccessToken,
} from "./galleryAccessToken.js"

export function canEditSelections(gallery) {
    return gallery?.selectionLocked !== true
}

export function galleryRequiresPassword(gallery) {
    return gallery?.passwordProtected === true
}

export function galleryRequiresEmailGate(gallery) {
    return gallery?.emailGateEnabled === true
}

export function hasGalleryAccessToken(req, gallery) {
    const token = extractGalleryAccessToken(req)
    if (!token) return false
    return verifyGalleryAccessToken(token, gallery._id ?? gallery.id)
}

export function hasGalleryPasswordAccess(req, gallery) {
    if (!galleryRequiresPassword(gallery)) return true
    const token = extractGalleryAccessToken(req)
    if (!token) return false
    return hasGalleryPasswordToken(token, gallery._id ?? gallery.id)
}

export function hasGalleryEmailAccess(req, gallery) {
    if (!galleryRequiresEmailGate(gallery)) return true
    const token = extractGalleryAccessToken(req)
    if (!token) return false
    return hasGalleryEmailToken(token, gallery._id ?? gallery.id)
}

export function hasGalleryAccess(req, gallery) {
    return (
        hasGalleryPasswordAccess(req, gallery) &&
        hasGalleryEmailAccess(req, gallery)
    )
}

export async function findPublicGalleryBySlugs(companySlug, gallerySlug) {
    const owner = await User.findOne({
        "studio.companySlug": companySlug,
    }).select("_id studio")

    if (!owner) return null

    const gallery = await Gallery.findOne({
        owner: owner._id,
        slug: gallerySlug,
        deletedAt: null,
    })
        .select("+clientPasswordHash")
        .populate({ path: "client", select: "name" })

    if (!gallery) return null
    if (!computeShareActive(gallery)) return { gallery, owner, inactive: true }

    return { gallery, owner, inactive: false }
}

export async function findPublicGalleryByToken(shareToken) {
    if (!shareToken?.trim()) return null

    const gallery = await Gallery.findOne({
        shareToken: shareToken.trim(),
        deletedAt: null,
    })
        .select("+clientPasswordHash")
        .populate({ path: "client", select: "name" })

    if (!gallery) return null

    const owner = await User.findById(gallery.owner).select("_id studio")
    if (!owner) return null

    if (!computeShareActive(gallery)) return { gallery, owner, inactive: true }

    return { gallery, owner, inactive: false }
}

export function publicGalleryBlockedResponse(res, hit) {
    if (!hit) {
        return res.status(404).json({ message: "Gallery not found" })
    }
    if (hit.inactive) {
        return res.status(403).json({
            message: "This gallery link is not active or has expired",
        })
    }
    return null
}

export function publicGalleryAccessDeniedResponse(res) {
    return res.status(401).json({
        message: "Gallery password required",
        accessRequired: true,
        passwordRequired: true,
    })
}

export function publicGalleryEmailRequiredResponse(res) {
    return res.status(401).json({
        message: "Email required to view this gallery",
        accessRequired: true,
        emailRequired: true,
        emailGateEnabled: true,
    })
}
