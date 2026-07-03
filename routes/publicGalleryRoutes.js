import express from "express"
import {
    downloadPublicFinal,
    flagPublicFinal,
    getPublicGallery,
    getPublicGalleryByToken,
    postPublicGalleryAccessEmail,
    submitPublicSelections,
    togglePublicSelection,
    unlockPublicGallery,
    updatePublicFinalComment,
    updatePublicPhotoComment,
} from "../controllers/publicGalleryController.js"

const router = express.Router()

router.get("/token/:shareToken", getPublicGalleryByToken)
router.post("/token/:shareToken/unlock", unlockPublicGallery)
router.post("/token/:shareToken/access-email", postPublicGalleryAccessEmail)
router.post("/token/:shareToken/select", togglePublicSelection)
router.post("/token/:shareToken/comment", updatePublicPhotoComment)
router.post("/token/:shareToken/submit-selections", submitPublicSelections)
router.get("/token/:shareToken/finals/:finalId/download", downloadPublicFinal)
router.post("/token/:shareToken/finals/:finalId/flag", flagPublicFinal)
router.patch("/token/:shareToken/finals/:finalId/comment", updatePublicFinalComment)

router.get("/:companySlug/:gallerySlug", getPublicGallery)
router.post("/:companySlug/:gallerySlug/unlock", unlockPublicGallery)
router.post("/:companySlug/:gallerySlug/access-email", postPublicGalleryAccessEmail)
router.post("/:companySlug/:gallerySlug/select", togglePublicSelection)
router.post("/:companySlug/:gallerySlug/comment", updatePublicPhotoComment)
router.post("/:companySlug/:gallerySlug/submit-selections", submitPublicSelections)
router.get(
    "/:companySlug/:gallerySlug/finals/:finalId/download",
    downloadPublicFinal
)
router.post("/:companySlug/:gallerySlug/finals/:finalId/flag", flagPublicFinal)
router.patch(
    "/:companySlug/:gallerySlug/finals/:finalId/comment",
    updatePublicFinalComment
)

export default router
