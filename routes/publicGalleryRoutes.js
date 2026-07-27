import express from "express"
import {
    applyPublicAiSuggestions,
    downloadPublicFinal,
    flagPublicFinal,
    getPublicAiSuggestions,
    getPublicGallery,
    getPublicGalleryByToken,
    pausePublicAiSuggestions,
    postPublicGalleryAccessEmail,
    resumePublicAiSuggestions,
    searchPublicGalleryPhotos,
    startPublicAiSuggestions,
    submitPublicSelections,
    terminatePublicAiSuggestions,
    togglePublicReject,
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
router.post("/token/:shareToken/reject", togglePublicReject)
router.post("/token/:shareToken/comment", updatePublicPhotoComment)
router.post("/token/:shareToken/submit-selections", submitPublicSelections)
router.get("/token/:shareToken/photos/search", searchPublicGalleryPhotos)
router.get("/token/:shareToken/ai-suggestions", getPublicAiSuggestions)
router.post("/token/:shareToken/ai-suggestions/start", startPublicAiSuggestions)
router.post("/token/:shareToken/ai-suggestions/pause", pausePublicAiSuggestions)
router.post("/token/:shareToken/ai-suggestions/resume", resumePublicAiSuggestions)
router.post("/token/:shareToken/ai-suggestions/terminate", terminatePublicAiSuggestions)
router.post("/token/:shareToken/apply-ai-suggestions", applyPublicAiSuggestions)
router.get("/token/:shareToken/finals/:finalId/download", downloadPublicFinal)
router.post("/token/:shareToken/finals/:finalId/flag", flagPublicFinal)
router.patch("/token/:shareToken/finals/:finalId/comment", updatePublicFinalComment)

router.get("/:companySlug/:gallerySlug", getPublicGallery)
router.post("/:companySlug/:gallerySlug/unlock", unlockPublicGallery)
router.post("/:companySlug/:gallerySlug/access-email", postPublicGalleryAccessEmail)
router.post("/:companySlug/:gallerySlug/select", togglePublicSelection)
router.post("/:companySlug/:gallerySlug/reject", togglePublicReject)
router.post("/:companySlug/:gallerySlug/comment", updatePublicPhotoComment)
router.post("/:companySlug/:gallerySlug/submit-selections", submitPublicSelections)
router.get("/:companySlug/:gallerySlug/photos/search", searchPublicGalleryPhotos)
router.get("/:companySlug/:gallerySlug/ai-suggestions", getPublicAiSuggestions)
router.post("/:companySlug/:gallerySlug/ai-suggestions/start", startPublicAiSuggestions)
router.post("/:companySlug/:gallerySlug/ai-suggestions/pause", pausePublicAiSuggestions)
router.post("/:companySlug/:gallerySlug/ai-suggestions/resume", resumePublicAiSuggestions)
router.post(
    "/:companySlug/:gallerySlug/ai-suggestions/terminate",
    terminatePublicAiSuggestions
)
router.post("/:companySlug/:gallerySlug/apply-ai-suggestions", applyPublicAiSuggestions)
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
