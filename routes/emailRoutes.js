import express from "express"
import { getEmailConfig, sendTestEmail } from "../controllers/emailController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/config", getEmailConfig)
router.post("/test", sendTestEmail)

export default router
