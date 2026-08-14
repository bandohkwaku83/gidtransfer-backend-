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
import {
    emptyAdminStudioTrash,
    extendAdminGalleryShare,
    getAdminGallery,
    listAdminGalleries,
    listAdminTrash,
    listModerationFlaggedFinals,
    listPhotographerGalleriesAdmin,
    patchAdminGalleryShare,
    purgeAdminExpiredTrash,
    purgeAdminGallery,
    restoreAdminGallery,
    revokeAdminGalleryShare,
} from "../controllers/adminGalleryController.js"
import {
    getStudioCrmSummary,
    listAdminBookingsCalendar,
    listStudioClientTotals,
} from "../controllers/adminCrmController.js"
import {
    listAdminBillingEvents,
    listAdminPlans,
    setPhotographerLimitOverride,
    updateAdminPlan,
} from "../controllers/adminBillingController.js"
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
router.get(
    "/photographers/:userId/galleries",
    protect,
    requireAdmin,
    listPhotographerGalleriesAdmin
)
router.post(
    "/photographers/:userId/communicate",
    protect,
    requireAdmin,
    sendPhotographerCommunication
)
router.put(
    "/photographers/:userId/limit-override",
    protect,
    requireAdmin,
    setPhotographerLimitOverride
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

/* Gallery inspector */
router.get("/galleries", protect, requireAdmin, listAdminGalleries)
router.get("/galleries/:galleryId", protect, requireAdmin, getAdminGallery)
router.post(
    "/galleries/:galleryId/share/revoke",
    protect,
    requireAdmin,
    revokeAdminGalleryShare
)
router.post(
    "/galleries/:galleryId/share/extend",
    protect,
    requireAdmin,
    extendAdminGalleryShare
)
router.patch(
    "/galleries/:galleryId/share",
    protect,
    requireAdmin,
    patchAdminGalleryShare
)
router.post(
    "/galleries/:galleryId/restore",
    protect,
    requireAdmin,
    restoreAdminGallery
)
router.delete(
    "/galleries/:galleryId/purge",
    protect,
    requireAdmin,
    purgeAdminGallery
)

router.get(
    "/moderation/flagged-finals",
    protect,
    requireAdmin,
    listModerationFlaggedFinals
)

router.get("/trash", protect, requireAdmin, listAdminTrash)
router.post("/trash/purge-expired", protect, requireAdmin, purgeAdminExpiredTrash)
router.post(
    "/photographers/:userId/trash/empty",
    protect,
    requireAdmin,
    emptyAdminStudioTrash
)

/* Aggregate CRM */
router.get("/crm/studios", protect, requireAdmin, listStudioClientTotals)
router.get(
    "/crm/studios/:userId",
    protect,
    requireAdmin,
    getStudioCrmSummary
)
router.get("/crm/bookings", protect, requireAdmin, listAdminBookingsCalendar)

/* Billing admin */
router.get("/billing/plans", protect, requireAdmin, listAdminPlans)
router.patch(
    "/billing/plans/:planId",
    protect,
    requireAdmin,
    updateAdminPlan
)
router.get("/billing/events", protect, requireAdmin, listAdminBillingEvents)

export default router
