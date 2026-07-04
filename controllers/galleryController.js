import mongoose from "mongoose"
import crypto from "crypto"

import Gallery from "../models/Gallery.js"
import Client from "../models/Client.js"
import {
    GalleryAiError,
    generateGalleryDescriptionFromEventName,
} from "../utils/galleryAiDescription.js"
import {
    attachGalleryCounts,
    buildGalleryListFilter,
    formatGalleryResponse,
    formatGallerySummaryResponse,
    galleryNotDeletedFilter,
    galleryOwnerFilter,
    invalidateGalleryCounts,
    parseGenerateDescriptionAi,
    parseGalleryInput,
} from "../utils/galleryFields.js"
import {
    buildChangedSinceFilter,
    parseSinceQuery,
} from "../utils/incrementalSync.js"
import { isSummaryView } from "../utils/sparseFields.js"
import { sendOwnerJson } from "../utils/listResponse.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import {
    deleteGalleryCoverFile,
    saveGalleryCoverFile,
    validateGalleryCoverFile,
} from "../utils/galleryCoverStorage.js"
import { ensureGallerySlug, ensureUserCompanySlug, assignGallerySlug } from "../utils/gallerySlugHelpers.js"
import {
    clearShareCoverSnapshot,
    snapshotShareCoverFromGallery,
    snapshotShareDesignFromGallery,
    syncShareCoverFromGalleryIfActive,
} from "../utils/galleryShareCover.js"
import {
    computeRestoreDeadline,
    effectiveRestoreDeadline,
    isRestoreExpired,
} from "../utils/galleryTrash.js"
import {
    mapGallerySmsError,
    notifyClientGalleryShareSms,
} from "../utils/galleryShareSms.js"
import User from "../models/User.js"
import { BOOKING_SHOOT_TYPES } from "../utils/bookingShootTypes.js"
import { formatGalleryDesignMeta } from "../utils/galleryDesignFields.js"
import { GALLERY_CLIENT_POPULATE } from "../utils/clientFields.js"

const validationMessage = (error) =>
    Object.values(error.errors)
        .map((e) => e.message)
        .join(", ")

const isDuplicateKeyError = (error) => error?.code === 11000

const slugConflictMessage = (error) => {
    const key = error?.keyPattern ?? {}
    if (key.slug || key["owner"] || key.owner) {
        return "This gallery URL is already in use"
    }
    return "A unique constraint was violated"
}

const populateGalleryBasic = GALLERY_CLIENT_POPULATE

const ownedGalleryFilter = (id, userId) => ({
    _id: id,
    ...galleryOwnerFilter(userId),
})

/** When link never expires (`shareLinkExpiryDays === null`). */
const computeShareExpiresAt = (galleryShareDays) => {
    if (galleryShareDays === null || galleryShareDays === undefined) return null
    const n = Number(galleryShareDays)
    if (!Number.isFinite(n) || n < 1) return null
    return new Date(Date.now() + n * 86_400_000)
}

async function assertOwnedClient(clientId, userId) {
    const exists = await Client.findOne({
        _id: clientId,
        ...galleryOwnerFilter(userId),
    })
    return Boolean(exists)
}

export const getGalleriesMeta = async (_req, res) => {
    try {
        return res.status(200).json({
            galleryTypes: BOOKING_SHOOT_TYPES,
            design: formatGalleryDesignMeta(),
        })
    } catch (error) {
        console.error("getGalleriesMeta:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const proposeGalleryDescription = async (req, res) => {
    try {
        const name =
            req.body?.eventName?.trim?.() ??
            req.body?.name?.trim?.() ??
            req.body?.event_name?.trim?.()
        const galleryType =
            req.body?.galleryType?.trim?.() ??
            req.body?.gallery_type?.trim?.() ??
            null

        const description = await generateGalleryDescriptionFromEventName(
            name ?? "",
            { galleryType }
        )
        return res.status(200).json({ description })
    } catch (error) {
        if (error instanceof GalleryAiError) {
            return res.status(error.statusCode).json({ message: error.message })
        }
        console.error("proposeGalleryDescription:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listGalleries = async (req, res) => {
    try {
        const trashParam = req.query.trash ?? req.query.in_trash
        const trashOnly =
            String(trashParam) === "1" ||
            String(trashParam || "").toLowerCase() === "true"

        const built = buildGalleryListFilter(req.user._id, {
            status: req.query.status,
            search: req.query.search ?? req.query.q,
            trashOnly,
        })
        if (built.filter === null) {
            return res.status(400).json({ message: built.error ?? "Invalid filter" })
        }

        const sinceParsed = parseSinceQuery(req.query)
        if (sinceParsed?.error) {
            return res.status(400).json({ message: sinceParsed.error })
        }
        if (sinceParsed?.since) {
            Object.assign(built.filter, buildChangedSinceFilter(sinceParsed.since))
        }

        const pagination = parsePagination(req.query, { defaultLimit: 50, maxLimit: 100 })
        const summary = isSummaryView(req.query)

        const [total, rows] = await Promise.all([
            Gallery.countDocuments(built.filter),
            paginatedQuery(
                Gallery.find(built.filter)
                    .populate(populateGalleryBasic)
                    .sort({ updatedAt: -1 }),
                pagination
            ).exec(),
        ])

        const formatRow = summary ? formatGallerySummaryResponse : formatGalleryResponse
        const galleries = rows.map(formatRow)
        const counts = await attachGalleryCounts(req.user._id)

        return sendOwnerJson(
            req,
            res,
            req.user._id,
            {
                counts,
                galleries,
                pagination: buildPaginationMeta({ ...pagination, total }),
            },
            {
                etagSeed: {
                    since: sinceParsed?.since?.toISOString() ?? null,
                    view: summary ? "summary" : "full",
                    status: req.query.status ?? null,
                },
            }
        )
    } catch (error) {
        console.error("listGalleries:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getGallery = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid gallery id" })
        }

        const gallery = await Gallery.findOne({
            ...ownedGalleryFilter(id, req.user._id),
            ...galleryNotDeletedFilter(),
        }).populate(populateGalleryBasic)

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        return res.status(200).json({ gallery: formatGalleryResponse(gallery) })
    } catch (error) {
        console.error("getGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createGallery = async (req, res) => {
    try {
        const { fields, errors } = parseGalleryInput(req.body, {
            partial: false,
        })
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const fileErr = validateGalleryCoverFile(req.file)
        if (fileErr) {
            return res.status(400).json({ message: fileErr })
        }

        const wantAi = parseGenerateDescriptionAi(req.body)

        let description = ""
        if (wantAi) {
            try {
                description = await generateGalleryDescriptionFromEventName(
                    fields.name,
                    { galleryType: fields.galleryType }
                )
            } catch (error) {
                if (error instanceof GalleryAiError) {
                    return res
                        .status(error.statusCode)
                        .json({ message: error.message })
                }
                throw error
            }
        } else if (fields.description !== undefined) {
            description = fields.description
        }

        const ownsClient = await assertOwnedClient(
            fields.clientId,
            req.user._id
        )
        if (!ownsClient) {
            return res.status(404).json({ message: "Client not found" })
        }

        const ownerSettings = await User.findById(req.user._id).select(
            "galleryDefaults watermark"
        )
        const watermarkPreviewEnabled = Boolean(
            ownerSettings?.galleryDefaults?.watermarkPreviewEnabled
        )
        const watermarkFinalsEnabled = Boolean(
            ownerSettings?.watermark?.enabled
        )

        const gallery = await Gallery.create({
            owner: req.user._id,
            client: fields.clientId,
            name: fields.name,
            eventDate: fields.eventDate,
            description,
            galleryType: fields.galleryType ?? null,
            status: fields.status ?? "draft",
            shareLinkExpiryDays:
                fields.shareLinkExpiryDays !== undefined
                    ? fields.shareLinkExpiryDays
                    : 30,
            useDefaultCover:
                fields.useDefaultCover !== undefined
                    ? fields.useDefaultCover
                    : true,
            watermarkPreviewEnabled,
            watermarkFinalsEnabled,
        })

        if (fields.slug !== undefined) {
            await assignGallerySlug(gallery, fields.slug)
        } else {
            await ensureGallerySlug(gallery, fields.name)
        }
        await gallery.save()

        if (gallery.useDefaultCover === false && req.file) {
            const url = await saveGalleryCoverFile(String(gallery._id), req.file)
            gallery.coverImageUrl = url
            await gallery.save()
        }

        await gallery.populate(populateGalleryBasic)
        invalidateGalleryCounts(req.user._id)
        return res.status(201).json({
            message: "Gallery created",
            gallery: formatGalleryResponse(gallery),
        })
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message })
        }
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        if (isDuplicateKeyError(error)) {
            return res.status(409).json({ message: slugConflictMessage(error) })
        }
        console.error("createGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGallery = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid gallery id" })
        }

        const gallery = await Gallery.findOne({
            ...ownedGalleryFilter(id, req.user._id),
            ...galleryNotDeletedFilter(),
        })

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const { fields, errors } = parseGalleryInput(req.body, {
            partial: true,
        })
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const fileErr = validateGalleryCoverFile(req.file)
        if (fileErr) {
            return res.status(400).json({ message: fileErr })
        }

        const wantAi = parseGenerateDescriptionAi(req.body)
        let appliedAi = false
        const nameSource = fields.name ?? gallery.name

        if (wantAi) {
            try {
                appliedAi = true
                gallery.description =
                    await generateGalleryDescriptionFromEventName(nameSource, {
                        galleryType:
                            fields.galleryType ?? gallery.galleryType ?? null,
                    })
            } catch (error) {
                if (error instanceof GalleryAiError) {
                    return res
                        .status(error.statusCode)
                        .json({ message: error.message })
                }
                throw error
            }
        }

        if (fields.name !== undefined) {
            gallery.name = fields.name
            if (!gallery.slug?.trim() && fields.slug === undefined) {
                await ensureGallerySlug(gallery, fields.name)
            }
        }

        if (fields.slug !== undefined) {
            await assignGallerySlug(gallery, fields.slug)
        }

        if (fields.eventDate !== undefined) gallery.eventDate = fields.eventDate

        /** Manual description loses to AI flag on this request only. */
        if (!appliedAi && fields.description !== undefined) {
            gallery.description = fields.description
        }

        if (fields.galleryType !== undefined) {
            gallery.galleryType = fields.galleryType
        }

        if (fields.clientId !== undefined) {
            const ok = await assertOwnedClient(fields.clientId, req.user._id)
            if (!ok) {
                return res.status(404).json({ message: "Client not found" })
            }
            gallery.client = fields.clientId
        }

        if (fields.status !== undefined) gallery.status = fields.status

        let shareExpiryChanged = false
        if (fields.shareLinkExpiryDays !== undefined) {
            gallery.shareLinkExpiryDays = fields.shareLinkExpiryDays
            shareExpiryChanged = true
        }

        let coverDecision = false
        if (fields.useDefaultCover !== undefined) {
            gallery.useDefaultCover = fields.useDefaultCover
            coverDecision = true
        }

        if (gallery.shareToken && shareExpiryChanged) {
            gallery.shareExpiresAt = computeShareExpiresAt(
                gallery.shareLinkExpiryDays
            )
        }

        if (
            coverDecision &&
            gallery.useDefaultCover === true &&
            gallery.coverImageUrl
        ) {
            deleteGalleryCoverFile(gallery.coverImageUrl)
            gallery.coverImageUrl = null
        }

        await gallery.save()

        const coverFileUploaded =
            gallery.useDefaultCover === false && Boolean(req.file)

        if (coverFileUploaded) {
            deleteGalleryCoverFile(gallery.coverImageUrl)
            gallery.coverImageUrl = await saveGalleryCoverFile(
                String(gallery._id),
                req.file
            )
            await gallery.save()
        }

        if (coverDecision || coverFileUploaded) {
            await syncShareCoverFromGalleryIfActive(gallery)
            await gallery.save()
        }

        await gallery.populate(populateGalleryBasic)
        invalidateGalleryCounts(req.user._id)
        return res.status(200).json({
            message: "Gallery updated",
            gallery: formatGalleryResponse(gallery),
        })
    } catch (error) {
        if (error.statusCode) {
            return res.status(error.statusCode).json({ message: error.message })
        }
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        if (isDuplicateKeyError(error)) {
            return res.status(409).json({ message: slugConflictMessage(error) })
        }
        console.error("updateGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteGallery = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid gallery id" })
        }

        const gallery = await Gallery.findOne({
            ...ownedGalleryFilter(id, req.user._id),
            ...galleryNotDeletedFilter(),
        })

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const now = new Date()
        clearShareCoverSnapshot(gallery)
        await Gallery.findByIdAndUpdate(gallery._id, {
            $set: {
                deletedAt: now,
                restoreDeadline: computeRestoreDeadline(now),
                shareExpiresAt: null,
                shareUseDefaultCover: null,
                shareCoverImageUrl: null,
                shareCoverFocalX: null,
                shareCoverFocalY: null,
                shareCoverTextColor: null,
                shareCoverButtonColor: null,
            },
            $unset: { shareToken: 1 },
        })

        const updated = await Gallery.findById(gallery._id)
        invalidateGalleryCounts(req.user._id)

        return res.status(200).json({
            message: "Gallery moved to trash",
            gallery: formatGalleryResponse(updated),
        })
    } catch (error) {
        console.error("deleteGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const restoreGallery = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid gallery id" })
        }

        const gallery = await Gallery.findOne({
            ...ownedGalleryFilter(id, req.user._id),
            deletedAt: { $ne: null },
        })

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found in trash" })
        }

        if (isRestoreExpired(effectiveRestoreDeadline(gallery))) {
            return res.status(410).json({ message: "Restore deadline has passed" })
        }

        gallery.deletedAt = null
        gallery.restoreDeadline = null
        await gallery.save()

        await gallery.populate(populateGalleryBasic)
        invalidateGalleryCounts(req.user._id)

        return res.status(200).json({
            message: "Gallery restored",
            gallery: formatGalleryResponse(gallery),
        })
    } catch (error) {
        console.error("restoreGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createShareLink = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid gallery id" })
        }

        const gallery = await Gallery.findOne({
            ...ownedGalleryFilter(id, req.user._id),
            ...galleryNotDeletedFilter(),
        })

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const owner = await User.findById(req.user._id).select("studio")
        if (owner) await ensureUserCompanySlug(owner)

        await ensureGallerySlug(gallery)
        gallery.shareToken = crypto.randomBytes(24).toString("base64url")
        gallery.shareExpiresAt = computeShareExpiresAt(
            gallery.shareLinkExpiryDays
        )
        await snapshotShareCoverFromGallery(gallery)
        snapshotShareDesignFromGallery(gallery)
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const notifyClientViaSms =
            req.body?.notifyClientViaSms === true ||
            req.body?.notifyClientViaSms === "true"
        let sms = null
        let smsError = null

        if (notifyClientViaSms) {
            const companySlug =
                owner?.studio?.companySlug?.trim() ||
                req.user.studio?.companySlug?.trim()
            try {
                sms = await notifyClientGalleryShareSms({
                    gallery,
                    ownerStudio: owner?.studio ?? req.user.studio,
                    companySlug,
                    customMessage: req.body?.message,
                })
            } catch (error) {
                const mapped = mapGallerySmsError(error)
                smsError = {
                    message: mapped.message,
                    code: mapped.code,
                }
            }
        }

        return res.status(200).json({
            message: "Share link activated",
            gallery: formatGalleryResponse(gallery),
            ...(sms ? { sms } : {}),
            ...(smsError ? { smsError } : {}),
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("createShareLink:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const revokeShareLink = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid gallery id" })
        }

        const gallery = await Gallery.findOne({
            ...ownedGalleryFilter(id, req.user._id),
            ...galleryNotDeletedFilter(),
        }).populate(populateGalleryBasic)

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        clearShareCoverSnapshot(gallery)
        await Gallery.findByIdAndUpdate(gallery._id, {
            $unset: { shareToken: 1 },
            $set: {
                shareExpiresAt: null,
                shareUseDefaultCover: null,
                shareCoverImageUrl: null,
                shareCoverFocalX: null,
                shareCoverFocalY: null,
                shareCoverTextColor: null,
                shareCoverButtonColor: null,
            },
            $unset: { shareToken: 1 },
        })
        const refreshed = await Gallery.findById(gallery._id).populate(
            populateGalleryBasic
        )

        return res.status(200).json({
            message: "Share link revoked",
            gallery: formatGalleryResponse(refreshed),
        })
    } catch (error) {
        console.error("revokeShareLink:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
