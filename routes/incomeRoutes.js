import express from "express"
import {
    createIncome,
    deleteIncome,
    getIncome,
    getIncomeSummary,
    listIncome,
    updateIncome,
} from "../controllers/incomeController.js"
import { protectUser } from "../middleware/userAuth.js"
import { requireMenu } from "../middleware/requireMenu.js"

const router = express.Router()

router.use(protectUser)
router.use(requireMenu("income"))

router.get("/summary", getIncomeSummary)
router.get("/", listIncome)
router.get("/:id", getIncome)
router.post("/", createIncome)
router.put("/:id", updateIncome)
router.delete("/:id", deleteIncome)

export default router
