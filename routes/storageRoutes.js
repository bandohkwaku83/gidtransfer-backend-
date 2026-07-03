import express from "express"
import { getStorage } from "../controllers/storageController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.get("/", protectUser, getStorage)

export default router
