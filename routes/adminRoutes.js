import express from "express"
import { adminLogin, adminMe } from "../controllers/authController.js"
import {
    approveStudioSenderId,
    listStudioSenderIds,
    rejectStudioSenderId,
} from "../controllers/adminSmsController.js"
import {
    getEmailBrandLogo,
    removeEmailBrandLogo,
    uploadEmailBrandLogo,
} from "../controllers/adminEmailController.js"
import { handleUploadBrandEmailLogo } from "../middleware/uploadBrandEmailLogo.js"
import { protect } from "../middleware/auth.js"
import { requireAdmin } from "../middleware/requireAdmin.js"

const router = express.Router()

router.post("/auth/login", adminLogin)
router.get("/auth/me", protect, requireAdmin, adminMe)

router.get("/sms/sender-ids", protect, requireAdmin, listStudioSenderIds)
router.patch(
    "/sms/sender-ids/:userId/approve",
    protect,
    requireAdmin,
    approveStudioSenderId
)
router.patch(
    "/sms/sender-ids/:userId/reject",
    protect,
    requireAdmin,
    rejectStudioSenderId
)

router.get("/email/logo", protect, requireAdmin, getEmailBrandLogo)
router.post(
    "/email/logo",
    protect,
    requireAdmin,
    handleUploadBrandEmailLogo,
    uploadEmailBrandLogo
)
router.delete("/email/logo", protect, requireAdmin, removeEmailBrandLogo)

export default router
