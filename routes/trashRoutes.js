import express from "express"
import {
    emptyTrash,
    listTrash,
    restoreTrashItems,
} from "../controllers/trashController.js"
import { protectUser } from "../middleware/userAuth.js"
import { requirePlanFeature } from "../middleware/requirePlanFeature.js"

const router = express.Router()

router.use(protectUser)

router.get("/", listTrash)
router.post("/restore", requirePlanFeature("restoreTrashItems"), restoreTrashItems)
router.delete("/", emptyTrash)

export default router
