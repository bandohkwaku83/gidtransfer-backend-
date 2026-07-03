import Gallery from "../models/Gallery.js"
import User from "../models/User.js"
import { slugify, uniqueSlug } from "./slugify.js"

const RESERVED_COMPANY_SLUGS = new Set([
    "www",
    "api",
    "app",
    "admin",
    "mail",
    "smtp",
    "ftp",
    "cdn",
    "static",
    "assets",
    "help",
    "support",
    "status",
    "blog",
    "client",
    "clients",
    "public",
])

export const isReservedCompanySlug = (slug) => RESERVED_COMPANY_SLUGS.has(slug)

export const suggestCompanySlugFromName = (companyName) => slugify(companyName)

export const validateCompanySlugFormat = (rawSlug) => {
    const trimmed = String(rawSlug ?? "").trim()
    if (!trimmed) {
        return { error: "Studio URL slug is required" }
    }

    const slug = slugify(trimmed)
    if (!slug) {
        return { error: "Studio URL slug is invalid" }
    }
    if (slug.length < 2) {
        return { error: "Studio URL slug must be at least 2 characters" }
    }
    if (slug !== trimmed.toLowerCase()) {
        return {
            error: "Studio URL slug may only contain lowercase letters, numbers, and hyphens",
        }
    }
    if (isReservedCompanySlug(slug)) {
        return { error: "This studio URL is reserved" }
    }

    return { slug }
}

export const isCompanySlugTaken = async (slug, excludeUserId) => {
    const hit = await User.findOne({
        _id: { $ne: excludeUserId },
        "studio.companySlug": slug,
    }).select("_id")
    return Boolean(hit)
}

/** Set studio.companySlug after format + uniqueness checks. Mutates user.studio. */
export const assignCompanySlug = async (user, rawSlug) => {
    const { slug, error } = validateCompanySlugFormat(rawSlug)
    if (error) {
        const err = new Error(error)
        err.statusCode = 400
        throw err
    }

    if (await isCompanySlugTaken(slug, user._id)) {
        const err = new Error("This studio URL is already taken")
        err.statusCode = 409
        throw err
    }

    const studio = user.studio ?? {}
    studio.companySlug = slug
    user.studio = studio
    return slug
}

export const ensureUserCompanySlug = async (user) => {
    const studio = user.studio ?? {}
    if (studio.companySlug?.trim()) return studio.companySlug.trim()

    const name = studio.companyName?.trim()
    if (!name) return null

    const slug = await uniqueSlug(name, async (candidate) => {
        const hit = await User.findOne({
            _id: { $ne: user._id },
            "studio.companySlug": candidate,
        }).select("_id")
        return Boolean(hit)
    })

    studio.companySlug = slug
    user.studio = studio
    await user.save()
    return slug
}

const RESERVED_GALLERY_SLUGS = new Set([
    ...RESERVED_COMPANY_SLUGS,
    "dashboard",
    "galleries",
    "gallery",
    "login",
    "logout",
    "register",
    "settings",
    "share",
    "trash",
    "new",
    "edit",
    "upload",
    "uploads",
    "finals",
    "selections",
])

export const isReservedGallerySlug = (slug) => RESERVED_GALLERY_SLUGS.has(slug)

export const validateGallerySlugFormat = (rawSlug) => {
    const trimmed = String(rawSlug ?? "").trim()
    if (!trimmed) {
        return { error: "Gallery URL slug is required" }
    }

    const slug = slugify(trimmed)
    if (!slug) {
        return { error: "Gallery URL slug is invalid" }
    }
    if (slug.length < 2) {
        return { error: "Gallery URL slug must be at least 2 characters" }
    }
    if (slug !== trimmed.toLowerCase()) {
        return {
            error: "Gallery URL slug may only contain lowercase letters, numbers, and hyphens",
        }
    }
    if (isReservedGallerySlug(slug)) {
        return { error: "This gallery URL is reserved" }
    }

    return { slug }
}

export const isGallerySlugTaken = async (slug, ownerId, excludeGalleryId) => {
    const hit = await Gallery.findOne({
        owner: ownerId,
        slug,
        _id: { $ne: excludeGalleryId },
        deletedAt: null,
    }).select("_id")
    return Boolean(hit)
}

/** Set gallery.slug after format + per-owner uniqueness checks. Mutates gallery. */
export const assignGallerySlug = async (gallery, rawSlug) => {
    const { slug, error } = validateGallerySlugFormat(rawSlug)
    if (error) {
        const err = new Error(error)
        err.statusCode = 400
        throw err
    }

    const ownerId = gallery.owner?._id ?? gallery.owner
    if (await isGallerySlugTaken(slug, ownerId, gallery._id)) {
        const err = new Error("This gallery URL is already in use")
        err.statusCode = 409
        throw err
    }

    gallery.slug = slug
    return slug
}

/** Auto-generate a unique slug from the gallery name when none exists yet. */
export const ensureGallerySlug = async (gallery, newName) => {
    const ownerId = gallery.owner?._id ?? gallery.owner
    const current = gallery.slug?.trim()
    if (current) return current

    const baseName = ((newName !== undefined ? newName : gallery.name) ?? "").trim()
    if (!baseName) return current ?? null

    const slug = await uniqueSlug(baseName, async (candidate) => {
        const hit = await Gallery.findOne({
            owner: ownerId,
            slug: candidate,
            _id: { $ne: gallery._id },
            deletedAt: null,
        }).select("_id")
        return Boolean(hit)
    })

    gallery.slug = slug
    return slug
}

/** Backfill slugs for galleries created before slug support. */
export const backfillGallerySlug = async (gallery) => {
    if (gallery.slug?.trim()) return gallery.slug.trim()
    await ensureGallerySlug(gallery)
    await gallery.save()
    return gallery.slug
}
