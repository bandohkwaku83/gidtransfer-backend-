import mongoose from "mongoose"
import Gallery from "../models/Gallery.js"
import GalleryAccessEmail from "../models/GalleryAccessEmail.js"
import {
    formatGalleryDetailResponse,
    loadOwnedGallery,
} from "../utils/galleryDetailHelpers.js"
import {
    deleteGalleryMusicFile,
    saveGalleryMusicFile,
    validateGalleryMusicFile,
} from "../utils/galleryMusicStorage.js"
import { parseGalleryDesignInput } from "../utils/galleryDesignFields.js"
import {
    hashGalleryPassword,
    validateGalleryPasswordInput,
} from "../utils/galleryPassword.js"
import { GALLERY_CLIENT_POPULATE } from "../utils/clientFields.js"

const populateGalleryBasic = GALLERY_CLIENT_POPULATE

const parseGalleryBool = (value) => {
    if (value === undefined || value === null || value === "") return undefined
    if (typeof value === "boolean") return value
    const normalized = String(value).trim().toLowerCase()
    if (normalized === "true" || normalized === "1" || normalized === "on") {
        return true
    }
    if (normalized === "false" || normalized === "0" || normalized === "off") {
        return false
    }
    return undefined
}

export const getGalleryDetail = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        await gallery.populate(populateGalleryBasic)
        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({ gallery: detail })
    } catch (error) {
        console.error("getGalleryDetail:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const markGalleryCompleted = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        if (gallery.status === "done") {
            return res.status(400).json({ message: "Gallery is already completed" })
        }

        gallery.status = "done"
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Gallery marked as completed",
            gallery: detail,
        })
    } catch (error) {
        console.error("markGalleryCompleted:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateCoverFocalPoint = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const x = Number(req.body?.coverFocalX ?? req.body?.cover_focal_x)
        const y = Number(req.body?.coverFocalY ?? req.body?.cover_focal_y)

        if (!Number.isFinite(x) || x < 0 || x > 100) {
            return res.status(400).json({ message: "coverFocalX must be 0–100" })
        }
        if (!Number.isFinite(y) || y < 0 || y > 100) {
            return res.status(400).json({ message: "coverFocalY must be 0–100" })
        }

        gallery.coverFocalX = x
        gallery.coverFocalY = y
        if (gallery.shareUseDefaultCover != null) {
            gallery.shareCoverFocalX = x
            gallery.shareCoverFocalY = y
        }
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Cover focal point updated",
            gallery: detail,
        })
    } catch (error) {
        console.error("updateCoverFocalPoint:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const uploadGalleryMusic = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const fileErr = validateGalleryMusicFile(req.file)
        if (fileErr) {
            return res.status(400).json({ message: fileErr })
        }

        if (gallery.backgroundMusicUrl) {
            deleteGalleryMusicFile(gallery.backgroundMusicUrl)
        }

        gallery.backgroundMusicUrl = await saveGalleryMusicFile(
            String(gallery._id),
            req.file
        )
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Background music uploaded",
            gallery: detail,
        })
    } catch (error) {
        console.error("uploadGalleryMusic:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const removeGalleryMusic = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        if (gallery.backgroundMusicUrl) {
            deleteGalleryMusicFile(gallery.backgroundMusicUrl)
            gallery.backgroundMusicUrl = null
        }
        gallery.backgroundMusicEnabled = false
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Background music removed",
            gallery: detail,
        })
    } catch (error) {
        console.error("removeGalleryMusic:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGalleryMusicSettings = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const raw =
            req.body?.backgroundMusicEnabled ??
            req.body?.background_music_enabled

        if (raw === undefined) {
            return res.status(400).json({ message: "backgroundMusicEnabled is required" })
        }

        const enabled =
            raw === true ||
            raw === "true" ||
            raw === 1 ||
            raw === "1"

        if (enabled && !gallery.backgroundMusicUrl) {
            return res.status(400).json({
                message: "Upload background music before enabling it",
            })
        }

        gallery.backgroundMusicEnabled = enabled
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Background music settings updated",
            gallery: detail,
        })
    } catch (error) {
        console.error("updateGalleryMusicSettings:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateSelectionSettings = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const raw =
            req.body?.maxSelections ?? req.body?.max_selections

        if (raw !== undefined) {
            if (raw === null || raw === "" || raw === "unlimited") {
                gallery.maxSelections = null
            } else {
                const n = Number(raw)
                if (!Number.isInteger(n) || n < 1) {
                    return res.status(400).json({
                        message:
                            "maxSelections must be a positive integer or null (unlimited)",
                    })
                }
                gallery.maxSelections = n
            }
        }

        const lockRaw =
            req.body?.selectionLocked ?? req.body?.selection_locked
        if (lockRaw !== undefined) {
            gallery.selectionLocked =
                lockRaw === true || lockRaw === "true" || lockRaw === 1 || lockRaw === "1"
        }

        const finalRaw =
            req.body?.finalDeliveryEnabled ??
            req.body?.final_delivery_enabled ??
            req.body?.finalDelivery ??
            req.body?.final_delivery
        if (finalRaw !== undefined) {
            gallery.finalDeliveryEnabled =
                finalRaw === true || finalRaw === "true" || finalRaw === 1 || finalRaw === "1"
        }

        if (
            raw === undefined &&
            lockRaw === undefined &&
            finalRaw === undefined
        ) {
            return res.status(400).json({
                message:
                    "Provide at least one of maxSelections, selectionLocked, or finalDeliveryEnabled",
            })
        }

        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Selection settings updated",
            gallery: detail,
        })
    } catch (error) {
        console.error("updateSelectionSettings:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGalleryUploadSettings = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const enabled = parseGalleryBool(
            req.body?.watermarkPreviewEnabled ??
                req.body?.watermark_preview_enabled ??
                req.body?.enabled
        )
        if (enabled === undefined) {
            return res.status(400).json({
                message: "watermarkPreviewEnabled (or enabled) is required",
            })
        }

        gallery.watermarkPreviewEnabled = enabled
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Upload settings updated",
            gallery: detail,
        })
    } catch (error) {
        console.error("updateGalleryUploadSettings:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGalleryDesignSettings = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const { fields, errors } = parseGalleryDesignInput(req.body ?? {})
        if (errors.length > 0) {
            return res.status(400).json({ message: errors[0], errors })
        }
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({
                message:
                    "Provide at least one of coverStyle, generalColor, backdropColor, coverTextColor, coverButtonColor, gridStyle, titleFont, or bodyFont",
            })
        }

        Object.assign(gallery, fields)
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Gallery design updated",
            gallery: detail,
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message })
        }
        console.error("updateGalleryDesignSettings:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGalleryClientAccess = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await Gallery.findOne({
            _id: id,
            owner: req.user._id,
            deletedAt: null,
        }).select("+clientPasswordHash")

        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const body = req.body ?? {}
        let changed = false

        const protectedRaw =
            body.passwordProtected ?? body.password_protected
        if (protectedRaw !== undefined) {
            gallery.passwordProtected =
                protectedRaw === true ||
                protectedRaw === "true" ||
                protectedRaw === 1 ||
                protectedRaw === "1"
            changed = true
            if (!gallery.passwordProtected) {
                gallery.clientPasswordHash = null
            }
        }

        const passwordRaw = body.password ?? body.clientPassword ?? body.client_password
        if (passwordRaw !== undefined) {
            if (passwordRaw === null || passwordRaw === "") {
                gallery.clientPasswordHash = null
            } else {
                const parsed = validateGalleryPasswordInput(passwordRaw)
                if (parsed.error) {
                    return res.status(400).json({ message: parsed.error })
                }
                gallery.clientPasswordHash = await hashGalleryPassword(parsed.password)
                gallery.passwordProtected = true
            }
            changed = true
        }

        const downloadsRaw = body.allowDownloads ?? body.allow_downloads
        if (downloadsRaw !== undefined) {
            gallery.allowDownloads =
                downloadsRaw === true ||
                downloadsRaw === "true" ||
                downloadsRaw === 1 ||
                downloadsRaw === "1"
            changed = true
        }

        const emailGateRaw =
            body.emailGateEnabled ??
            body.email_gate_enabled ??
            body.requireEmailToView ??
            body.require_email_to_view
        if (emailGateRaw !== undefined) {
            gallery.emailGateEnabled =
                emailGateRaw === true ||
                emailGateRaw === "true" ||
                emailGateRaw === 1 ||
                emailGateRaw === "1"
            changed = true
        }

        if (!changed) {
            return res.status(400).json({
                message:
                    "Provide at least one of passwordProtected, password, allowDownloads, or emailGateEnabled",
            })
        }

        if (gallery.passwordProtected && !gallery.clientPasswordHash) {
            return res.status(400).json({
                message: "Set a password before enabling password protection",
            })
        }

        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Client access settings updated",
            gallery: detail,
        })
    } catch (error) {
        console.error("updateGalleryClientAccess:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGalleryFinalSettings = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const enabled = parseGalleryBool(
            req.body?.watermarkFinalsEnabled ??
                req.body?.watermark_finals_enabled ??
                req.body?.watermarkEnabled ??
                req.body?.watermark_enabled ??
                req.body?.enabled
        )
        if (enabled === undefined) {
            return res.status(400).json({
                message:
                    "watermarkFinalsEnabled (or watermarkEnabled / enabled) is required",
            })
        }

        gallery.watermarkFinalsEnabled = enabled
        await gallery.save()
        await gallery.populate(populateGalleryBasic)

        const detail = await formatGalleryDetailResponse(gallery)
        return res.status(200).json({
            message: "Final delivery settings updated",
            gallery: detail,
        })
    } catch (error) {
        console.error("updateGalleryFinalSettings:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listGalleryAccessEmails = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const rows = await GalleryAccessEmail.find({ gallery: gallery._id })
            .sort({ accessedAt: -1 })
            .select("email accessedAt")
            .lean()

        return res.status(200).json({
            emails: rows.map((row) => ({
                email: row.email,
                accessedAt: row.accessedAt,
            })),
        })
    } catch (error) {
        console.error("listGalleryAccessEmails:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
