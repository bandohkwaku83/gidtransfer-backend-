import express from "express"
import {
    createClient,
    deleteClient,
    getClient,
    listClients,
    updateClient,
} from "../controllers/clientController.js"
import { protectUser } from "../middleware/userAuth.js"
import { requireMenu } from "../middleware/requireMenu.js"

const router = express.Router()

router.use(protectUser)
router.use(requireMenu("clients"))

router.get("/", listClients)
router.get("/:id", getClient)
router.post("/", createClient)
router.put("/:id", updateClient)
router.delete("/:id", deleteClient)

export default router
