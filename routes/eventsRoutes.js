import express from "express"
import { streamOwnerEvents } from "../controllers/eventsController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.get("/stream", protectUser, streamOwnerEvents)

export default router
