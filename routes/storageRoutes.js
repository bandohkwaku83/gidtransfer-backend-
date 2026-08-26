import express from "express"
import { getStorage } from "../controllers/storageController.js"
import { protectUser } from "../middleware/userAuth.js"
import { requireMenu } from "../middleware/requireMenu.js"

const router = express.Router()

router.get("/", protectUser, requireMenu("storage"), getStorage)

export default router
