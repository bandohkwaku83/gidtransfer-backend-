import express from "express"
import {
    completeOnboarding,
    getStudio,
    updateStudio,
} from "../controllers/onboardingController.js"
import { handleUploadStudioLogo } from "../middleware/uploadStudioLogo.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/", getStudio)
router.post("/", handleUploadStudioLogo, completeOnboarding)
router.put("/", handleUploadStudioLogo, updateStudio)

export default router
