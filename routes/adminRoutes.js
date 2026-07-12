import express from "express"
import { adminLogin, adminMe } from "../controllers/authController.js"
import {
    approveStudioSenderId,
    listStudioSenderIds,
    rejectStudioSenderId,
} from "../controllers/adminSmsController.js"
import { getAdminStats } from "../controllers/adminStatsController.js"
import {
    activatePhotographer,
    deactivatePhotographer,
    getPhotographer,
    listPhotographerSessions,
    listPhotographers,
    updatePhotographer,
    verifyPhotographerEmail,
} from "../controllers/adminPhotographerController.js"
import {
    listIssueReports,
    updateIssueReport,
} from "../controllers/adminIssueReportController.js"
import {
    getCommunicationConfig,
    listCommunications,
    sendCommunicationEmail,
    sendCommunicationSms,
    sendPhotographerCommunication,
} from "../controllers/adminCommunicationController.js"
import { protect } from "../middleware/auth.js"
import { requireAdmin } from "../middleware/requireAdmin.js"

const router = express.Router()

router.post("/auth/login", adminLogin)
router.get("/auth/me", protect, requireAdmin, adminMe)

router.get("/stats", protect, requireAdmin, getAdminStats)

router.get("/photographers", protect, requireAdmin, listPhotographers)
router.get(
    "/photographers/:userId/sessions",
    protect,
    requireAdmin,
    listPhotographerSessions
)
router.post(
    "/photographers/:userId/communicate",
    protect,
    requireAdmin,
    sendPhotographerCommunication
)
router.patch(
    "/photographers/:userId/activate",
    protect,
    requireAdmin,
    activatePhotographer
)
router.patch(
    "/photographers/:userId/deactivate",
    protect,
    requireAdmin,
    deactivatePhotographer
)
router.post(
    "/photographers/:userId/verify-email",
    protect,
    requireAdmin,
    verifyPhotographerEmail
)
router.get("/photographers/:userId", protect, requireAdmin, getPhotographer)
router.patch("/photographers/:userId", protect, requireAdmin, updatePhotographer)

router.get("/issue-reports", protect, requireAdmin, listIssueReports)
router.patch(
    "/issue-reports/:id",
    protect,
    requireAdmin,
    updateIssueReport
)

router.get("/communications/config", protect, requireAdmin, getCommunicationConfig)
router.get("/communications", protect, requireAdmin, listCommunications)
router.post("/communications/sms", protect, requireAdmin, sendCommunicationSms)
router.post(
    "/communications/email",
    protect,
    requireAdmin,
    sendCommunicationEmail
)

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

export default router
