import mongoose from "mongoose"
import GalleryFinal from "../models/GalleryFinal.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import {
    formatGalleryFinalResponse,
    formatGalleryPhotoResponse,
    loadOwnedGallery,
} from "../utils/galleryDetailHelpers.js"
import { appendFeedbackMessage } from "../utils/feedbackThread.js"
import { galleryClientSelectionPhotoFilter } from "../utils/galleryFields.js"

function parseReplyBody(body) {
    if (body?.reply === undefined && body?.photographerReply === undefined) {
        return { error: "reply is required" }
    }
    const raw = body?.reply ?? body?.photographerReply
    return { reply: String(raw ?? "").trim() }
}

export const patchGallerySelectionReply = async (req, res) => {
    try {
        const { id, photoId } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        if (!mongoose.isValidObjectId(photoId)) {
            return res.status(400).json({ message: "Invalid photo id" })
        }

        const parsed = parseReplyBody(req.body ?? {})
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error })
        }

        const photo = await GalleryPhoto.findOne({
            _id: photoId,
            ...galleryClientSelectionPhotoFilter(gallery._id),
        }).exec()

        if (!photo) {
            return res.status(404).json({
                message: "Selected photo not found",
            })
        }

        photo.photographerReply = parsed.reply
        photo.photographerRepliedAt = parsed.reply ? new Date() : null
        if (parsed.reply) {
            appendFeedbackMessage(photo, "photographer", parsed.reply)
        }
        await photo.save()

        return res.status(200).json({
            message: parsed.reply ? "Reply saved" : "Reply cleared",
            photo: formatGalleryPhotoResponse(photo),
        })
    } catch (error) {
        console.error("patchGallerySelectionReply:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const patchGalleryFinalReply = async (req, res) => {
    try {
        const { id, finalId } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        if (!mongoose.isValidObjectId(finalId)) {
            return res.status(400).json({ message: "Invalid final id" })
        }

        const parsed = parseReplyBody(req.body ?? {})
        if (parsed.error) {
            return res.status(400).json({ message: parsed.error })
        }

        const row = await GalleryFinal.findOne({
            _id: finalId,
            gallery: gallery._id,
            deletedAt: null,
            flaggedByClient: true,
        }).exec()

        if (!row) {
            return res.status(404).json({
                message: "Flagged final not found",
            })
        }

        row.photographerReply = parsed.reply
        row.photographerRepliedAt = parsed.reply ? new Date() : null
        if (parsed.reply) {
            appendFeedbackMessage(row, "photographer", parsed.reply)
        }
        await row.save()

        return res.status(200).json({
            message: parsed.reply ? "Reply saved" : "Reply cleared",
            final: formatGalleryFinalResponse(row),
        })
    } catch (error) {
        console.error("patchGalleryFinalReply:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
