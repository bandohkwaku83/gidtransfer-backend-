import express from "express"
import {
    cancelBillingSubscription,
    checkoutBillingPlan,
    getBillingConfig,
    getBillingSubscription,
    listBillingPlans,
    resumeBillingSubscription,
    verifyBillingPayment,
} from "../controllers/billingController.js"
import { protectUser } from "../middleware/userAuth.js"
import { requireStudioOwner } from "../middleware/requireMenu.js"

const router = express.Router()

router.use(protectUser)
router.use(requireStudioOwner)

router.get("/config", getBillingConfig)
router.get("/plans", listBillingPlans)
router.get("/subscription", getBillingSubscription)
router.post("/checkout", checkoutBillingPlan)
router.post("/cancel", cancelBillingSubscription)
router.post("/resume", resumeBillingSubscription)
router.get("/verify", verifyBillingPayment)
router.post("/verify", verifyBillingPayment)

export default router
