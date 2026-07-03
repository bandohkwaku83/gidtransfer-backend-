import express from "express"
import { getDashboard } from "../controllers/dashboardController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.get("/", protectUser, getDashboard)

export default router
