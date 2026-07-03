import express from "express"
import {
    emptyTrash,
    listTrash,
    restoreTrashItems,
} from "../controllers/trashController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.use(protectUser)

router.get("/", listTrash)
router.post("/restore", restoreTrashItems)
router.delete("/", emptyTrash)

export default router
