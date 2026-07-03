import express from "express"
import {
    cancelBillingSubscription,
    checkoutBillingPlan,
    getBillingConfig,
    getBillingSubscription,
    listBillingPlans,
    verifyBillingPayment,
} from "../controllers/billingController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/config", getBillingConfig)
router.get("/plans", listBillingPlans)
router.get("/subscription", getBillingSubscription)
router.post("/checkout", checkoutBillingPlan)
router.post("/cancel", cancelBillingSubscription)
router.get("/verify", verifyBillingPayment)
router.post("/verify", verifyBillingPayment)

export default router
