import { buildGalleryAnalytics } from "../utils/galleryAnalytics.js"
import { loadOwnedGallery } from "../utils/galleryDetailHelpers.js"
import { sendFeatureDenied, userHasFeature } from "../utils/planFeatures.js"

export const getGalleryAnalytics = async (req, res) => {
    try {
        const { id } = req.params
        const gallery = await loadOwnedGallery(id, req.user._id)
        if (!gallery) {
            return res.status(404).json({ message: "Gallery not found" })
        }

        if (!userHasFeature(req.user, "analyticsDashboard")) {
            return sendFeatureDenied(res, "analyticsDashboard", { user: req.user })
        }

        const advanced = userHasFeature(req.user, "advancedAnalytics")
        const analytics = await buildGalleryAnalytics(gallery._id, { advanced })
        return res.status(200).json({
            analytics,
            upgrade: advanced
                ? null
                : {
                      feature: "advancedAnalytics",
                      message:
                          "Upgrade to Business for download counts and 7-day activity reports.",
                  },
        })
    } catch (error) {
        console.error("getGalleryAnalytics:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
