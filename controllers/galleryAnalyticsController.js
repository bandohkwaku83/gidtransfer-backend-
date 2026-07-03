import { buildGalleryAnalytics } from "../utils/galleryAnalytics.js"
import { loadOwnedGallery } from "../utils/galleryDetailHelpers.js"

export const getGalleryAnalytics = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        const analytics = await buildGalleryAnalytics(gallery._id)
        return res.status(200).json({ analytics })
    } catch (error) {
        console.error("getGalleryAnalytics:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
