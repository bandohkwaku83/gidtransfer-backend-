import express from "express"
import { getSmsConfig, sendTestSms } from "../controllers/smsController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/config", getSmsConfig)
router.post("/test", sendTestSms)

export default router
