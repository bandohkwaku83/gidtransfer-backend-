import express from "express"
import { protectUser } from "../middleware/userAuth.js"
import { requirePlanFeature } from "../middleware/requirePlanFeature.js"
import { requireStudioOwner } from "../middleware/requireMenu.js"
import {
    createStudioTeamMember,
    getStudioTeamMeta,
    listStudioTeam,
    removeStudioTeamMember,
    resetStudioTeamMemberPassword,
    updateStudioTeamMember,
} from "../controllers/studioTeamController.js"

const router = express.Router()

router.use(protectUser)
router.use(requireStudioOwner)

router.get("/meta", getStudioTeamMeta)
router.get("/team", listStudioTeam)
router.post("/team", requirePlanFeature("studioTeam"), createStudioTeamMember)
router.patch("/team/:memberId", requirePlanFeature("studioTeam"), updateStudioTeamMember)
router.delete("/team/:memberId", removeStudioTeamMember)
router.post(
    "/team/:memberId/reset-password",
    requirePlanFeature("studioTeam"),
    resetStudioTeamMemberPassword
)

export default router
