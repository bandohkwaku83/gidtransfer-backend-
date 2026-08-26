import express from "express"
import { getDashboard } from "../controllers/dashboardController.js"
import { protectUser } from "../middleware/userAuth.js"
import { requireMenu } from "../middleware/requireMenu.js"

const router = express.Router()

router.get("/", protectUser, requireMenu("dashboard"), getDashboard)

export default router
