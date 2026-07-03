import GalleryFinal from "../models/GalleryFinal.js"
import {
    formatGalleryFinalResponse,
    formatGalleryPhotoResponse,
    loadOwnedGallery,
} from "../utils/galleryDetailHelpers.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import {
    galleryClientSelectionPhotoFilter,
    galleryClientSelectionPhotoSort,
    galleryNotDeletedFilter,
} from "../utils/galleryFields.js"

export const listGallerySelections = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const rows = await GalleryPhoto.find(
            galleryClientSelectionPhotoFilter(gallery._id)
        )
            .sort(galleryClientSelectionPhotoSort)
            .exec()

        const flaggedFinals = await GalleryFinal.find({
            gallery: gallery._id,
            ...galleryNotDeletedFilter(),
            flaggedByClient: true,
        })
            .sort({ flaggedAt: 1, createdAt: 1 })
            .exec()

        return res.status(200).json({
            selectionSubmittedAt: gallery.selectionSubmittedAt ?? null,
            selectionLocked: gallery.selectionLocked === true,
            photos: rows.map(formatGalleryPhotoResponse),
            flaggedFinals: flaggedFinals.map(formatGalleryFinalResponse),
        })
    } catch (error) {
        console.error("listGallerySelections:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
