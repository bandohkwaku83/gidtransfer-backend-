import express from "express"
import {
    getSyncRevision,
    getSyncChanges,
    postSyncBatch,
} from "../controllers/syncController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/revision", getSyncRevision)
router.get("/changes", getSyncChanges)
router.post("/batch", postSyncBatch)

export default router
