import express from "express"
import {
    createGallery,
    createShareLink,
    deleteGallery,
    getGallery,
    getGalleriesMeta,
    listGalleries,
    proposeGalleryDescription,
    restoreGallery,
    revokeShareLink,
    updateGallery,
} from "../controllers/galleryController.js"
import {
    getGalleryDetail,
    listGalleryAccessEmails,
    markGalleryCompleted,
    removeGalleryMusic,
    updateCoverFocalPoint,
    updateGalleryFinalSettings,
    updateGalleryMusicSettings,
    updateGalleryUploadSettings,
    updateSelectionSettings,
    uploadGalleryMusic,
} from "../controllers/galleryDetailController.js"
import {
    bulkDeleteGalleryPhotos,
    completeGalleryPhotoUploads,
    deleteGalleryPhoto,
    listGalleryUploads,
    presignGalleryPhotoUploads,
    reorderGalleryUploads,
    restoreGalleryPhoto,
    uploadGalleryPhotos,
} from "../controllers/galleryUploadController.js"
import {
    createGallerySet,
    deleteGallerySet,
    listGallerySets,
    updateGallerySet,
    updateGallerySetsSettings,
} from "../controllers/gallerySetController.js"
import { getGalleryAnalytics } from "../controllers/galleryAnalyticsController.js"
import { listGallerySelections } from "../controllers/gallerySelectionController.js"
import {
    patchGalleryFinalReply,
    patchGallerySelectionReply,
} from "../controllers/galleryFeedbackController.js"
import {
    updateGalleryClientAccess,
    updateGalleryDesignSettings,
} from "../controllers/galleryDetailController.js"
import {
    bulkDeleteGalleryFinals,
    completeGalleryFinalUploads,
    deleteGalleryFinal,
    listGalleryFlaggedFinals,
    listGalleryFinals,
    presignGalleryFinalUploads,
    reorderGalleryFinals,
    restoreGalleryFinal,
    updateGalleryFinalLock,
    uploadGalleryFinals,
} from "../controllers/galleryFinalController.js"
import { multipartGalleryCoverOptional } from "../middleware/multipartGalleryCoverOptional.js"
import { handleGalleryPhotosUpload } from "../middleware/uploadGalleryPhotos.js"
import { handleGalleryMusicUpload } from "../middleware/uploadGalleryMusic.js"
import { handleGalleryFinalsUpload } from "../middleware/uploadGalleryFinals.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.post("/generate-description", proposeGalleryDescription)
router.get("/meta", getGalleriesMeta)
router.get("/", listGalleries)

router.get("/:id/detail", getGalleryDetail)
router.get("/:id/analytics", getGalleryAnalytics)
router.patch("/:id/complete", markGalleryCompleted)
router.patch("/:id/cover-focal-point", updateCoverFocalPoint)
router.post("/:id/music", handleGalleryMusicUpload, uploadGalleryMusic)
router.delete("/:id/music", removeGalleryMusic)
router.patch("/:id/music", updateGalleryMusicSettings)
router.patch("/:id/selection-settings", updateSelectionSettings)
router.patch("/:id/design-settings", updateGalleryDesignSettings)
router.patch("/:id/client-access", updateGalleryClientAccess)
router.get("/:id/access-emails", listGalleryAccessEmails)
router.patch("/:id/upload-settings", updateGalleryUploadSettings)
router.patch("/:id/final-settings", updateGalleryFinalSettings)

router.get("/:id/sets", listGallerySets)
router.patch("/:id/sets-settings", updateGallerySetsSettings)
router.post("/:id/sets", createGallerySet)
router.patch("/:id/sets/:setId", updateGallerySet)
router.delete("/:id/sets/:setId", deleteGallerySet)

router.get("/:id/uploads", listGalleryUploads)
router.post("/:id/uploads/presign", presignGalleryPhotoUploads)
router.post("/:id/uploads/complete", completeGalleryPhotoUploads)
router.patch("/:id/uploads/reorder", reorderGalleryUploads)
router.post("/:id/uploads", handleGalleryPhotosUpload, uploadGalleryPhotos)
router.post("/:id/uploads/bulk-delete", bulkDeleteGalleryPhotos)
router.delete("/:id/uploads/:photoId", deleteGalleryPhoto)
router.post("/:id/uploads/:photoId/restore", restoreGalleryPhoto)

router.get("/:id/selections", listGallerySelections)
router.patch("/:id/selections/:photoId/reply", patchGallerySelectionReply)

router.get("/:id/finals", listGalleryFinals)
router.get("/:id/finals/flagged", listGalleryFlaggedFinals)
router.post("/:id/finals/presign", presignGalleryFinalUploads)
router.post("/:id/finals/complete", completeGalleryFinalUploads)
router.patch("/:id/finals/reorder", reorderGalleryFinals)
router.post("/:id/finals", handleGalleryFinalsUpload, uploadGalleryFinals)
router.post("/:id/finals/bulk-delete", bulkDeleteGalleryFinals)
router.patch("/:id/finals/:finalId/lock", updateGalleryFinalLock)
router.patch("/:id/finals/:finalId/reply", patchGalleryFinalReply)
router.delete("/:id/finals/:finalId", deleteGalleryFinal)
router.post("/:id/finals/:finalId/restore", restoreGalleryFinal)

router.get("/:id", getGallery)

router.post("/", multipartGalleryCoverOptional, createGallery)
router.put("/:id", multipartGalleryCoverOptional, updateGallery)

router.patch("/:id/restore", restoreGallery)
router.delete("/:id", deleteGallery)

router.post("/:id/share-link", createShareLink)
router.delete("/:id/share-link", revokeShareLink)

export default router
