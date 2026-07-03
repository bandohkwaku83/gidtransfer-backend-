import express from "express"
import {
    getSettings,
    getSettingsAccount,
    getSettingsOverview,
    getSettingsProfile,
    getSettingsStudio,
    updateSettings,
} from "../controllers/settingsController.js"
import {
    getWatermarkSettings,
    updateWatermarkSettings,
} from "../controllers/watermarkController.js"
import {
    getGalleryDefaultsSettings,
    updateGalleryDefaultsSettings,
    patchGalleryDefaultsWatermarkPreview,
    uploadGalleryDefaultsCover,
    deleteGalleryDefaultsCover,
} from "../controllers/galleryDefaultsController.js"
import {
    getIssueReportForm,
    submitIssueReport,
} from "../controllers/issueReportController.js"
import { handleUploadSettings } from "../middleware/uploadSettings.js"
import { handleUploadWatermarkLogo } from "../middleware/uploadWatermark.js"
import { handleUploadGalleryDefaultCover } from "../middleware/uploadGalleryDefaults.js"
import { handleUploadIssueReport } from "../middleware/uploadIssueReport.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/", getSettings)
router.put("/", handleUploadSettings, updateSettings)

router.get("/profile", getSettingsProfile)
router.get("/overview", getSettingsOverview)
router.get("/studio", getSettingsStudio)
router.get("/account", getSettingsAccount)

router.get("/watermark", getWatermarkSettings)
router.put("/watermark", handleUploadWatermarkLogo, updateWatermarkSettings)

router.get("/gallery-defaults", getGalleryDefaultsSettings)
router.put(
    "/gallery-defaults",
    handleUploadGalleryDefaultCover,
    updateGalleryDefaultsSettings
)
router.patch("/gallery-defaults", patchGalleryDefaultsWatermarkPreview)
router.patch(
    "/gallery-defaults/watermark-preview",
    patchGalleryDefaultsWatermarkPreview
)
router.put(
    "/gallery-defaults/default-cover",
    handleUploadGalleryDefaultCover,
    uploadGalleryDefaultsCover
)
router.post(
    "/gallery-defaults/default-cover",
    handleUploadGalleryDefaultCover,
    uploadGalleryDefaultsCover
)
router.delete(
    "/gallery-defaults/default-cover",
    deleteGalleryDefaultsCover
)

router.get("/report-issue", getIssueReportForm)
router.get("/help-support", getIssueReportForm)
router.post("/report-issue", handleUploadIssueReport, submitIssueReport)
router.post("/help-support", handleUploadIssueReport, submitIssueReport)

export default router
