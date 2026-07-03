import fs from "fs"
import path from "path"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GallerySet from "../models/GallerySet.js"
import {
    buildPublicGallerySetsResponse,
    formatPublicGalleryFinalResponse,
    formatPublicGalleryPhotoResponse,
} from "../utils/galleryDetailHelpers.js"
import { formatGallerySetsSettingsResponse } from "../utils/galleryFields.js"
import { resolveMediaUrl, formatPublicStudioResponse } from "../utils/formatUserResponse.js"
import { GALLERY_FINALS_DIR } from "../utils/galleryFinalStorage.js"
import {
    canEditSelections,
    findPublicGalleryBySlugs,
    findPublicGalleryByToken,
    galleryRequiresPassword,
    hasGalleryEmailAccess,
    hasGalleryPasswordAccess,
    publicGalleryAccessDeniedResponse,
    publicGalleryBlockedResponse,
    publicGalleryEmailRequiredResponse,
} from "../utils/publicGalleryHelpers.js"
import { resolvePublicGalleryCover } from "../utils/galleryShareCover.js"
import { shootTypeLabel } from "../utils/bookingShootTypes.js"
import { GALLERY_MEDIA_SORT } from "../utils/galleryMediaOrder.js"
import {
    formatGalleryClientAccessResponse,
    formatGalleryDesignResponse,
    formatGalleryShareDesignSnapshot,
} from "../utils/galleryDesignFields.js"
import {
    galleryClientSelectionPhotoFilter,
    galleryClientSelectionPhotoSort,
    galleryPublicBrowsePhotoFilter,
    galleryPublicPhotoAccessFilter,
    mergePublicGalleryBrowsePhotos,
} from "../utils/galleryFields.js"
import {
    extractGalleryAccessToken,
    hasGalleryEmailToken,
    issueGalleryAccessToken,
    setGalleryAccessCookie,
} from "../utils/galleryAccessToken.js"
import { verifyGalleryPassword } from "../utils/galleryPassword.js"
import { isValidEmail, normalizeEmail } from "../utils/galleryEmail.js"
import GalleryAccessEmail from "../models/GalleryAccessEmail.js"
import { appendFeedbackMessage } from "../utils/feedbackThread.js"
import { recordGalleryAnalyticsEvent } from "../utils/galleryAnalytics.js"
import {
    notifyPhotographerFinalFlagged,
    notifyPhotographerGalleryComment,
    notifyPhotographerSelectionsSubmitted,
    queuePhotographerEmail,
} from "../utils/photographerNotifications.js"

function galleryClientName(gallery) {
    return gallery.client?.name?.trim() || "Your client"
}

function queueGalleryEmail(promise) {
    queuePhotographerEmail(promise)
}

function formatPublicGalleryMeta(gallery, { selectedCount = 0 } = {}) {
    const { coverImageUrl, coverFocalX, coverFocalY } =
        resolvePublicGalleryCover(gallery)
    const maxSelections = gallery.maxSelections ?? null
    const selectionLimit = maxSelections

    return {
        id: gallery._id,
        name: gallery.name,
        eventDate: gallery.eventDate,
        description: gallery.description ?? "",
        galleryType: gallery.galleryType ?? null,
        galleryTypeLabel: gallery.galleryType
            ? shootTypeLabel(gallery.galleryType)
            : null,
        status: gallery.status,
        maxSelections,
        selectionLimit,
        selectionsUsed: selectedCount,
        selectionsRemaining:
            selectionLimit != null
                ? Math.max(0, selectionLimit - selectedCount)
                : null,
        selectionSubmittedAt: gallery.selectionSubmittedAt ?? null,
        selectionSubmitted: Boolean(gallery.selectionSubmittedAt),
        selectionLocked: gallery.selectionLocked === true,
        canEditSelections: canEditSelections(gallery),
        finalDelivery: gallery.finalDeliveryEnabled !== false,
        coverImageUrl: coverImageUrl ? resolveMediaUrl(coverImageUrl) : null,
        coverFocalX,
        coverFocalY,
        design: formatGalleryDesignResponse(gallery),
        ...formatGalleryDesignResponse(gallery),
        ...formatGalleryShareDesignSnapshot(gallery),
        clientAccess: formatGalleryClientAccessResponse(gallery),
        passwordProtected: gallery.passwordProtected === true,
        allowDownloads: gallery.allowDownloads !== false,
        emailGateEnabled: gallery.emailGateEnabled === true,
        email_gate_enabled: gallery.emailGateEnabled === true,
        requireEmailToView: gallery.emailGateEnabled === true,
        require_email_to_view: gallery.emailGateEnabled === true,
        watermarkPreviewEnabled: gallery.watermarkPreviewEnabled === true,
        backgroundMusicUrl:
            gallery.backgroundMusicEnabled && gallery.backgroundMusicUrl
                ? resolveMediaUrl(gallery.backgroundMusicUrl)
                : null,
        clientName: gallery.client?.name ?? null,
        ...formatGallerySetsSettingsResponse(gallery),
    }
}

async function buildPublicGalleryPayload(hit) {
    const { gallery, owner } = hit
    const companySlug = owner.studio?.companySlug ?? null
    const allowDownloads = gallery.allowDownloads !== false

    const [photos, selected, finals, setRows] = await Promise.all([
        GalleryPhoto.find(galleryPublicBrowsePhotoFilter(gallery._id))
            .sort(GALLERY_MEDIA_SORT)
            .exec(),
        GalleryPhoto.find(galleryClientSelectionPhotoFilter(gallery._id))
            .sort(galleryClientSelectionPhotoSort)
            .exec(),
        gallery.finalDeliveryEnabled !== false
            ? GalleryFinal.find({
                  gallery: gallery._id,
                  deletedAt: null,
              })
                  .sort(GALLERY_MEDIA_SORT)
                  .exec()
            : Promise.resolve([]),
        GallerySet.find({ gallery: gallery._id })
            .sort({ sortOrder: 1, createdAt: 1 })
            .exec(),
    ])

    const flaggedFinals = finals.filter((f) => f.flaggedByClient)

    const photosForClient = mergePublicGalleryBrowsePhotos(photos, selected)

    const watermarkPreviewEnabled = gallery.watermarkPreviewEnabled === true
    const photoOptions = {
        absoluteUrls: true,
        watermarkPreviewEnabled,
    }
    const formatPhoto = (p) => formatPublicGalleryPhotoResponse(p, photoOptions)
    const formatFinal = (f) =>
        formatPublicGalleryFinalResponse(f, { allowDownloads })

    const sets = buildPublicGallerySetsResponse(
        setRows,
        photosForClient,
        finals,
        { formatPhoto, formatFinal }
    )

    return {
        accessRequired: false,
        emailGateEnabled: gallery.emailGateEnabled === true,
        gallery: formatPublicGalleryMeta(gallery, {
            selectedCount: selected.length,
        }),
        folder: formatPublicGalleryMeta(gallery, {
            selectedCount: selected.length,
        }),
        studio: formatPublicStudioResponse(owner.studio, companySlug),
        sets,
        photos: photosForClient.map(formatPhoto),
        selections: selected.map(formatPhoto),
        finals: finals.map(formatFinal),
        flaggedFinals: flaggedFinals.map(formatFinal),
        counts: {
            sets: sets.length,
            uploads: photos.length,
            selected: selected.length,
            finals: finals.length,
            flaggedFinals: flaggedFinals.length,
            selectionLimit: gallery.maxSelections ?? null,
            selectionsRemaining:
                gallery.maxSelections != null
                    ? Math.max(0, gallery.maxSelections - selected.length)
                    : null,
        },
    }
}

async function loadPublicPhoto(gallery, photoId) {
    if (!photoId) return null
    return GalleryPhoto.findOne(galleryPublicPhotoAccessFilter(gallery._id, photoId))
}

async function resolvePublicHit(req) {
    if (req.params.shareToken) {
        return findPublicGalleryByToken(req.params.shareToken)
    }
    return findPublicGalleryBySlugs(req.params.companySlug, req.params.gallerySlug)
}

function ensurePublicGalleryAccess(hit, req, res) {
    if (!hit || hit.inactive) {
        return { denied: res.status(404).json({ message: "Gallery not found" }) }
    }
    if (!hasGalleryPasswordAccess(req, hit.gallery)) {
        return { denied: publicGalleryAccessDeniedResponse(res) }
    }
    if (!hasGalleryEmailAccess(req, hit.gallery)) {
        return { denied: publicGalleryEmailRequiredResponse(res) }
    }
    return { denied: null }
}

async function buildPublicGalleryMetaPayload(hit) {
    const { gallery, owner } = hit
    const companySlug = owner.studio?.companySlug ?? null
    const galleryMeta = formatPublicGalleryMeta(gallery, { selectedCount: 0 })

    return {
        accessRequired: true,
        emailRequired: true,
        emailGateEnabled: true,
        gallery: galleryMeta,
        folder: galleryMeta,
        studio: formatPublicStudioResponse(owner.studio, companySlug),
        sets: [],
        photos: [],
        selections: [],
        finals: [],
        flaggedFinals: [],
        counts: {
            sets: 0,
            uploads: 0,
            selected: 0,
            finals: 0,
            flaggedFinals: 0,
            selectionLimit: gallery.maxSelections ?? null,
            selectionsRemaining:
                gallery.maxSelections != null ? gallery.maxSelections : null,
        },
    }
}

async function handlePublicMutation(req, res, handler) {
    try {
        const hit = await resolvePublicHit(req)
        const access = ensurePublicGalleryAccess(hit, req, res)
        if (access.denied) return access.denied
        return handler(hit, req, res)
    } catch (error) {
        console.error("publicGallery mutation:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

async function respondWithPublicGallery(hit, req, res) {
    if (!hasGalleryPasswordAccess(req, hit.gallery)) {
        return publicGalleryAccessDeniedResponse(res)
    }
    if (!hasGalleryEmailAccess(req, hit.gallery)) {
        const payload = await buildPublicGalleryMetaPayload(hit)
        return res.status(200).json(payload)
    }
    const payload = await buildPublicGalleryPayload(hit)
    recordGalleryAnalyticsEvent(hit.gallery._id, "link_view")
    return res.status(200).json(payload)
}

export const getPublicGallery = async (req, res) => {
    try {
        const { companySlug, gallerySlug } = req.params
        const hit = await findPublicGalleryBySlugs(companySlug, gallerySlug)
        const blocked = publicGalleryBlockedResponse(res, hit)
        if (blocked) return blocked

        return respondWithPublicGallery(hit, req, res)
    } catch (error) {
        console.error("getPublicGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getPublicGalleryByToken = async (req, res) => {
    try {
        const { shareToken } = req.params
        const hit = await findPublicGalleryByToken(shareToken)
        const blocked = publicGalleryBlockedResponse(res, hit)
        if (blocked) return blocked

        return respondWithPublicGallery(hit, req, res)
    } catch (error) {
        console.error("getPublicGalleryByToken:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const unlockPublicGallery = async (req, res) => {
    try {
        const hit = await resolvePublicHit(req)
        const blocked = publicGalleryBlockedResponse(res, hit)
        if (blocked) return blocked

        const { gallery } = hit

        if (!galleryRequiresPassword(gallery)) {
            const payload = hasGalleryEmailAccess(req, gallery)
                ? await buildPublicGalleryPayload(hit)
                : await buildPublicGalleryMetaPayload(hit)
            return res.status(200).json({
                ...payload,
                message: "Gallery is not password protected",
                accessToken: null,
            })
        }

        const password = req.body?.password ?? req.body?.clientPassword
        if (!password) {
            return res.status(400).json({ message: "password is required" })
        }

        const valid = await verifyGalleryPassword(
            password,
            gallery.clientPasswordHash
        )
        if (!valid) {
            return res.status(401).json({ message: "Incorrect password" })
        }

        const accessToken = issueGalleryAccessToken(
            gallery._id,
            extractGalleryAccessToken(req),
            { password: true }
        )

        if (!hasGalleryEmailToken(accessToken, gallery._id)) {
            const metaPayload = await buildPublicGalleryMetaPayload(hit)
            return res.status(200).json({
                ...metaPayload,
                message: "Gallery unlocked",
                accessToken,
            })
        }

        const payload = await buildPublicGalleryPayload(hit)
        recordGalleryAnalyticsEvent(gallery._id, "link_view")
        return res.status(200).json({
            ...payload,
            message: "Gallery unlocked",
            accessToken,
        })
    } catch (error) {
        console.error("unlockPublicGallery:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const postPublicGalleryAccessEmail = async (req, res) => {
    try {
        const hit = await resolvePublicHit(req)
        const blocked = publicGalleryBlockedResponse(res, hit)
        if (blocked) return blocked

        if (!hasGalleryPasswordAccess(req, hit.gallery)) {
            return publicGalleryAccessDeniedResponse(res)
        }

        const { gallery } = hit
        const email = normalizeEmail(req.body?.email)
        if (!isValidEmail(email)) {
            return res.status(400).json({ message: "A valid email is required" })
        }

        await GalleryAccessEmail.create({
            gallery: gallery._id,
            email,
            ipAddress: req.ip ?? null,
            userAgent: req.headers["user-agent"] ?? null,
        })

        const accessToken = issueGalleryAccessToken(
            gallery._id,
            extractGalleryAccessToken(req),
            { email: true }
        )
        setGalleryAccessCookie(res, accessToken)
        res.setHeader("x-gallery-access-token", accessToken)
        return res.status(204).send()
    } catch (error) {
        console.error("postPublicGalleryAccessEmail:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

function selectionLockedResponse(res) {
    return res.status(403).json({
        message: "Selections are locked by the photographer",
        selectionLocked: true,
    })
}

function applyClientPhotoComment(photo, comment) {
    const text = String(comment ?? "").trim()
    if (!text) return
    appendFeedbackMessage(photo, "client", text)
}

async function toggleSelectionForGallery(gallery, req, res) {
    if (!canEditSelections(gallery)) {
        return selectionLockedResponse(res)
    }

    const photoId = req.body?.photoId ?? req.body?.photo_id
    if (!photoId) {
        return res.status(400).json({ message: "photoId is required" })
    }

    const photo = await loadPublicPhoto(gallery, photoId)
    if (!photo) {
        return res.status(404).json({ message: "Photo not found" })
    }

    const comment =
        req.body?.comment !== undefined
            ? String(req.body.comment).trim()
            : undefined

    if (photo.selectedByClient) {
        photo.selectedByClient = false
        photo.selectedAt = null
        if (comment !== undefined && comment) {
            applyClientPhotoComment(photo, comment)
        }
    } else {
        const currentCount = await GalleryPhoto.countDocuments(
            galleryClientSelectionPhotoFilter(gallery._id)
        )

        if (
            gallery.maxSelections != null &&
            currentCount >= gallery.maxSelections
        ) {
            return res.status(400).json({
                message: `Maximum ${gallery.maxSelections} selections allowed`,
                selectionLimit: gallery.maxSelections,
                selectionsUsed: currentCount,
                selectionsRemaining: 0,
            })
        }

        photo.selectedByClient = true
        photo.selectedAt = new Date()
        if (comment !== undefined && comment) {
            applyClientPhotoComment(photo, comment)
        }
    }

    await photo.save()

    if (comment !== undefined && String(comment).trim()) {
        queueGalleryEmail(
            notifyPhotographerGalleryComment({
                ownerId: gallery.owner,
                gallery,
                clientName: galleryClientName(gallery),
                comment: String(comment).trim(),
            })
        )
    }

    if (gallery.status === "draft") {
        gallery.status = "selecting"
        await gallery.save()
    }

    return res.status(200).json({
        photo: formatPublicGalleryPhotoResponse(photo, {
            absoluteUrls: true,
            watermarkPreviewEnabled: gallery.watermarkPreviewEnabled === true,
        }),
    })
}

export const togglePublicSelection = (req, res) =>
    handlePublicMutation(req, res, ({ gallery }, req, res) =>
        toggleSelectionForGallery(gallery, req, res)
    )

async function updateCommentForGallery(gallery, req, res) {
    if (!canEditSelections(gallery)) {
        return selectionLockedResponse(res)
    }

    const photoId = req.body?.photoId ?? req.body?.photo_id
    if (!photoId) {
        return res.status(400).json({ message: "photoId is required" })
    }

    const commentRaw = req.body?.comment
    if (commentRaw === undefined) {
        return res.status(400).json({ message: "comment is required" })
    }

    const photo = await loadPublicPhoto(gallery, photoId)
    if (!photo) {
        return res.status(404).json({ message: "Photo not found" })
    }

    const comment = String(commentRaw).trim()
    if (!comment) {
        return res.status(400).json({ message: "comment cannot be empty" })
    }

    applyClientPhotoComment(photo, comment)
    await photo.save()

    queueGalleryEmail(
        notifyPhotographerGalleryComment({
            ownerId: gallery.owner,
            gallery,
            clientName: galleryClientName(gallery),
            comment,
        })
    )

    return res.status(200).json({
        photo: formatPublicGalleryPhotoResponse(photo, {
            absoluteUrls: true,
            watermarkPreviewEnabled: gallery.watermarkPreviewEnabled === true,
        }),
    })
}

export const updatePublicPhotoComment = (req, res) =>
    handlePublicMutation(req, res, ({ gallery }, req, res) =>
        updateCommentForGallery(gallery, req, res)
    )

async function flagFinalForGallery(gallery, req, res) {
    if (gallery.finalDeliveryEnabled === false) {
        return res.status(404).json({ message: "Final delivery is not enabled" })
    }

    const { finalId } = req.params
    const commentRaw = req.body?.comment ?? req.body?.flagComment
    if (commentRaw === undefined || String(commentRaw).trim() === "") {
        return res.status(400).json({
            message: "comment is required when flagging a final",
        })
    }

    const row = await loadPublicFinal(gallery, finalId)
    if (!row) {
        return res.status(404).json({ message: "Final not found" })
    }

    if (row.flaggedByClient) {
        return res.status(409).json({
            message: "This final has already been flagged",
            final: formatPublicGalleryFinalResponse(row, {
                allowDownloads: gallery.allowDownloads !== false,
            }),
        })
    }

    row.flaggedByClient = true
    row.flaggedAt = new Date()
    applyClientFinalComment(row, commentRaw)
    await row.save()

    const flagComment = String(commentRaw).trim()
    queueGalleryEmail(
        notifyPhotographerFinalFlagged({
            ownerId: gallery.owner,
            gallery,
            clientName: galleryClientName(gallery),
            comment: flagComment,
        })
    )

    return res.status(200).json({
        message: "Final flagged",
        final: formatPublicGalleryFinalResponse(row, {
            allowDownloads: gallery.allowDownloads !== false,
        }),
    })
}

function applyClientFinalComment(row, comment) {
    const text = String(comment ?? "").trim()
    if (!text) return
    appendFeedbackMessage(row, "client", text)
}

export const flagPublicFinal = (req, res) =>
    handlePublicMutation(req, res, ({ gallery }, req, res) =>
        flagFinalForGallery(gallery, req, res)
    )

async function submitSelectionsForGallery(gallery, req, res) {
    if (!canEditSelections(gallery)) {
        return selectionLockedResponse(res)
    }

    gallery.selectionSubmittedAt = new Date()
    if (gallery.status !== "done") {
        gallery.status = "selecting"
    }
    await gallery.save()

    const selected = await GalleryPhoto.find(
        galleryClientSelectionPhotoFilter(gallery._id)
    ).sort(galleryClientSelectionPhotoSort)

    queueGalleryEmail(
        notifyPhotographerSelectionsSubmitted({
            ownerId: gallery.owner,
            gallery,
            clientName: galleryClientName(gallery),
            selectionCount: selected.length,
        })
    )

    return res.status(200).json({
        message: "Selections submitted",
        selectionSubmittedAt: gallery.selectionSubmittedAt,
        selectionSubmitted: true,
        selectionLocked: gallery.selectionLocked === true,
        selectionLimit: gallery.maxSelections ?? null,
        selectionsUsed: selected.length,
        photos: selected.map((p) =>
            formatPublicGalleryPhotoResponse(p, {
                absoluteUrls: true,
                watermarkPreviewEnabled: gallery.watermarkPreviewEnabled === true,
            })
        ),
    })
}

export const submitPublicSelections = (req, res) =>
    handlePublicMutation(req, res, ({ gallery }, req, res) =>
        submitSelectionsForGallery(gallery, req, res)
    )

async function loadPublicFinal(gallery, finalId) {
    if (!finalId) return null
    return GalleryFinal.findOne({
        _id: finalId,
        gallery: gallery._id,
        deletedAt: null,
    })
}

async function updateFinalCommentForGallery(gallery, req, res) {
    if (gallery.finalDeliveryEnabled === false) {
        return res.status(404).json({ message: "Final delivery is not enabled" })
    }

    const { finalId } = req.params
    const commentRaw = req.body?.comment
    if (commentRaw === undefined) {
        return res.status(400).json({ message: "comment is required" })
    }

    const row = await loadPublicFinal(gallery, finalId)
    if (!row) {
        return res.status(404).json({ message: "Final not found" })
    }

    if (!row.flaggedByClient) {
        return res.status(400).json({
            message: "Flag the final first with POST .../finals/:finalId/flag",
        })
    }

    const comment = String(commentRaw).trim()
    if (!comment) {
        return res.status(400).json({ message: "comment cannot be empty" })
    }

    applyClientFinalComment(row, comment)
    await row.save()

    queueGalleryEmail(
        notifyPhotographerGalleryComment({
            ownerId: gallery.owner,
            gallery,
            clientName: galleryClientName(gallery),
            comment,
        })
    )

    return res.status(200).json({
        final: formatPublicGalleryFinalResponse(row, {
            allowDownloads: gallery.allowDownloads !== false,
        }),
    })
}

export const updatePublicFinalComment = (req, res) =>
    handlePublicMutation(req, res, ({ gallery }, req, res) =>
        updateFinalCommentForGallery(gallery, req, res)
    )

export const downloadPublicFinal = async (req, res) => {
    try {
        const hit = await resolvePublicHit(req)

        if (!hit || hit.inactive) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const access = ensurePublicGalleryAccess(hit, req, res)
        if (access.denied) return access.denied

        const { gallery } = hit
        const { finalId } = req.params
        if (gallery.finalDeliveryEnabled === false) {
            return res.status(404).json({ message: "Final delivery is not enabled" })
        }

        if (gallery.allowDownloads === false) {
            return res.status(403).json({
                message: "Downloads are disabled for this gallery",
                allowDownloads: false,
            })
        }

        const row = await GalleryFinal.findOne({
            _id: finalId,
            gallery: gallery._id,
            deletedAt: null,
        })

        if (!row) {
            return res.status(404).json({ message: "Final not found" })
        }

        if (row.isLocked) {
            return res.status(403).json({
                message: "This final is locked until payment is received",
                outstandingBalanceGhs: row.outstandingBalanceGhs ?? null,
            })
        }

        const filePath = path.join(
            GALLERY_FINALS_DIR,
            String(gallery._id),
            row.storedFilename
        )

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ message: "File not found" })
        }

        recordGalleryAnalyticsEvent(gallery._id, "client_download", {
            finalId: row._id,
        })

        res.setHeader("Content-Type", row.mimeType)
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(row.originalFilename)}"`
        )

        return fs.createReadStream(filePath).pipe(res)
    } catch (error) {
        console.error("downloadPublicFinal:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
