import express from "express"
import {
    forgotPassword,
    googleAuth,
    login,
    logout,
    me,
    register,
    resendVerification,
    resetPassword,
    verifyEmail,
} from "../controllers/authController.js"
import { protectUser } from "../middleware/userAuth.js"

const router = express.Router()

router.post("/register", register)
router.post("/google", googleAuth)
router.post("/login", login)
router.post("/forgot-password", forgotPassword)
router.post("/reset-password", resetPassword)
router.post("/verify-email", protectUser, verifyEmail)
router.post("/resend-verification", protectUser, resendVerification)
router.get("/me", protectUser, me)
router.post("/logout", protectUser, logout)
router.post("/signout", protectUser, logout)

export default router
