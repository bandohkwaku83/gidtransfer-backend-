import mongoose from "mongoose"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GallerySet from "../models/GallerySet.js"
import {
    formatGallerySetResponse,
    loadOwnedGallery,
} from "../utils/galleryDetailHelpers.js"
import { formatGallerySetsSettingsResponse } from "../utils/galleryFields.js"

export const listGallerySets = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const rows = await GallerySet.find({ gallery: gallery._id })
            .sort({ sortOrder: 1, createdAt: 1 })
            .exec()

        return res.status(200).json({
            ...formatGallerySetsSettingsResponse(gallery),
            sets: rows.map(formatGallerySetResponse),
        })
    } catch (error) {
        console.error("listGallerySets:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createGallerySet = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const name = String(req.body?.name ?? "").trim()
        if (!name) {
            return res.status(400).json({ message: "Set name is required" })
        }
        if (name.length > 80) {
            return res.status(400).json({ message: "Set name is too long (max 80 characters)" })
        }

        const last = await GallerySet.findOne({ gallery: gallery._id })
            .sort({ sortOrder: -1 })
            .select("sortOrder")
            .exec()
        const sortOrder =
            last && typeof last.sortOrder === "number" ? last.sortOrder + 1 : 0

        const row = await GallerySet.create({
            gallery: gallery._id,
            owner: req.user._id,
            name,
            sortOrder,
        })

        return res.status(201).json({
            message: "Set created",
            set: formatGallerySetResponse(row),
        })
    } catch (error) {
        console.error("createGallerySet:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGallerySet = async (req, res) => {
    try {
        const { id, setId } = req.params
        if (!mongoose.isValidObjectId(setId)) {
            return res.status(400).json({ message: "Invalid set id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const row = await GallerySet.findOne({ _id: setId, gallery: gallery._id }).exec()
        if (!row) {
            return res.status(404).json({ message: "Set not found" })
        }

        const name = req.body?.name
        if (name !== undefined) {
            const trimmed = String(name).trim()
            if (!trimmed) {
                return res.status(400).json({ message: "Set name cannot be empty" })
            }
            if (trimmed.length > 80) {
                return res.status(400).json({ message: "Set name is too long (max 80 characters)" })
            }
            row.name = trimmed
        }

        const sortOrder = req.body?.sortOrder ?? req.body?.sort_order
        if (sortOrder !== undefined) {
            const n = Number(sortOrder)
            if (!Number.isFinite(n)) {
                return res.status(400).json({ message: "sortOrder must be a number" })
            }
            row.sortOrder = n
        }

        await row.save()

        return res.status(200).json({
            message: "Set updated",
            set: formatGallerySetResponse(row),
        })
    } catch (error) {
        console.error("updateGallerySet:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateGallerySetsSettings = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const labelRaw = req.body?.setsAllLabel ?? req.body?.sets_all_label
        if (labelRaw !== undefined) {
            const trimmed = String(labelRaw).trim()
            if (!trimmed) {
                return res.status(400).json({ message: "setsAllLabel cannot be empty" })
            }
            if (trimmed.length > 80) {
                return res.status(400).json({
                    message: "setsAllLabel is too long (max 80 characters)",
                })
            }
            gallery.setsAllLabel = trimmed
        }

        const sortOrderRaw =
            req.body?.setsAllSortOrder ?? req.body?.sets_all_sort_order
        if (sortOrderRaw !== undefined) {
            const n = Number(sortOrderRaw)
            if (!Number.isFinite(n)) {
                return res.status(400).json({
                    message: "setsAllSortOrder must be a number",
                })
            }
            gallery.setsAllSortOrder = n
        }

        if (labelRaw === undefined && sortOrderRaw === undefined) {
            return res.status(400).json({
                message: "Provide at least one of setsAllLabel or setsAllSortOrder",
            })
        }

        await gallery.save()

        return res.status(200).json({
            message: "Sets settings updated",
            ...formatGallerySetsSettingsResponse(gallery),
        })
    } catch (error) {
        console.error("updateGallerySetsSettings:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteGallerySet = async (req, res) => {
    try {
        const { id, setId } = req.params
        if (!mongoose.isValidObjectId(setId)) {
            return res.status(400).json({ message: "Invalid set id" })
        }

        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const row = await GallerySet.findOne({ _id: setId, gallery: gallery._id }).exec()
        if (!row) {
            return res.status(404).json({ message: "Set not found" })
        }

        await Promise.all([
            GalleryPhoto.updateMany(
                { gallery: gallery._id, set: row._id },
                { $set: { set: null } }
            ),
            GalleryFinal.updateMany(
                { gallery: gallery._id, set: row._id },
                { $set: { set: null } }
            ),
        ])
        await row.deleteOne()

        return res.status(200).json({ message: "Set deleted" })
    } catch (error) {
        console.error("deleteGallerySet:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
