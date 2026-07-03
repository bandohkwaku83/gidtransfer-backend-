import jwt from "jsonwebtoken"
import Admin from "../models/Admin.js"
import User from "../models/User.js"
import { generateUserToken } from "../utils/authToken.js"
import { providerSignInHint } from "../utils/authMessages.js"
import { nextAccountId } from "../utils/accountId.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import {
    createPasswordResetToken,
    hashPasswordResetToken,
    PASSWORD_RESET_EXPIRY_MS,
} from "../utils/passwordReset.js"
import { parseSignUpInput } from "../utils/signUpFields.js"
import { sendPasswordResetEmail, sendEmailVerificationOtp } from "../utils/photographerNotifications.js"
import {
    createEmailVerificationOtp,
    hashEmailVerificationOtp,
    EMAIL_VERIFICATION_EXPIRY_MS,
    resendCooldownRemainingSeconds,
} from "../utils/emailVerification.js"
import { verifyGoogleIdToken } from "../utils/verifyGoogleIdToken.js"

const authSuccess = (user, message = "Login successful") => ({
    message,
    token: generateUserToken(user),
    user: formatUserResponse(user),
    requiresEmailVerification: !formatUserResponse(user).emailVerified,
})

const FORGOT_PASSWORD_MESSAGE =
    "If an account exists for that email, password reset instructions have been sent."

const issueAndSendEmailVerification = async (user) => {
    const { code, hash } = createEmailVerificationOtp()
    user.emailVerificationOtpHash = hash
    user.emailVerificationExpires = new Date(
        Date.now() + EMAIL_VERIFICATION_EXPIRY_MS
    )
    user.emailVerificationSentAt = new Date()
    await user.save()

    try {
        const result = await sendEmailVerificationOtp({ email: user.email, code })
        if (result?.dryRun && process.env.NODE_ENV !== "production") {
            console.log(`[email-verification] ${user.email}: ${code}`)
        }
    } catch (error) {
        console.error(
            `[email-verification] email failed for ${user.email}:`,
            error.message
        )
        if (process.env.NODE_ENV !== "production") {
            console.log(`[email-verification] ${user.email}: ${code}`)
        }
    }
}

export const register = async (req, res) => {
    try {
        const { fields, errors } = parseSignUpInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const existing = await User.findOne({ email: fields.email })
        if (existing) {
            return res
                .status(409)
                .json({ message: "An account with this email already exists" })
        }

        const accountId = await nextAccountId()
        const user = await User.create({ ...fields, accountId })
        await issueAndSendEmailVerification(user)

        const token = generateUserToken(user)

        return res.status(201).json({
            message: "Account created successfully",
            token,
            user: formatUserResponse(user),
            requiresEmailVerification: true,
        })
    } catch (error) {
        if (error.code === 11000) {
            return res
                .status(409)
                .json({ message: "An account with this email already exists" })
        }
        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)[0]?.message
            return res.status(400).json({ message: message || "Invalid input" })
        }
        console.error("Register error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const login = async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res
                .status(400)
                .json({ message: "Email and password are required" })
        }

        const normalizedEmail = email.toLowerCase().trim()
        const user = await User.findOne({ email: normalizedEmail, isActive: true })

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" })
        }

        if (user.authProvider !== "email") {
            return res.status(401).json({
                message: providerSignInHint(user.authProvider),
            })
        }

        const isMatch = await user.comparePassword(password)
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" })
        }

        return res.status(200).json(authSuccess(user))
    } catch (error) {
        console.error("Login error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const me = async (req, res) => {
    return res.status(200).json({ user: formatUserResponse(req.user) })
}

export const logout = async (req, res) => {
    try {
        req.user.tokenVersion = (req.user.tokenVersion ?? 0) + 1
        await req.user.save()

        return res.status(200).json({ message: "Signed out successfully" })
    } catch (error) {
        console.error("Logout error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body
        if (!email?.trim()) {
            return res.status(400).json({ message: "Email is required" })
        }

        const normalizedEmail = email.toLowerCase().trim()
        const user = await User.findOne({
            email: normalizedEmail,
            isActive: true,
            authProvider: "email",
        }).select("+passwordResetToken +passwordResetExpires")

        if (user) {
            const { raw, hash } = createPasswordResetToken()
            user.passwordResetToken = hash
            user.passwordResetExpires = new Date(
                Date.now() + PASSWORD_RESET_EXPIRY_MS
            )
            await user.save()

            const appUrl = (process.env.APP_URL || "http://localhost:3000").replace(
                /\/$/,
                ""
            )
            const resetUrl = `${appUrl}/reset-password?token=${raw}`

            try {
                await sendPasswordResetEmail({
                    email: normalizedEmail,
                    resetUrl,
                })
            } catch (error) {
                console.error(
                    `[password-reset] email failed for ${normalizedEmail}:`,
                    error.message
                )
                if (process.env.NODE_ENV !== "production") {
                    console.log(`[password-reset] ${normalizedEmail}: ${resetUrl}`)
                }
            }
        }

        return res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE })
    } catch (error) {
        console.error("Forgot password error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const resetPassword = async (req, res) => {
    try {
        const { token, password } = req.body

        if (!token?.trim()) {
            return res.status(400).json({ message: "Reset token is required" })
        }
        if (!password || password.length < 6) {
            return res
                .status(400)
                .json({ message: "Password must be at least 6 characters" })
        }

        const tokenHash = hashPasswordResetToken(token.trim())
        const user = await User.findOne({
            passwordResetToken: tokenHash,
            passwordResetExpires: { $gt: new Date() },
            isActive: true,
            authProvider: "email",
        }).select("+passwordResetToken +passwordResetExpires")

        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired reset link. Request a new one.",
            })
        }

        user.password = password
        user.passwordResetToken = undefined
        user.passwordResetExpires = undefined
        await user.save()

        return res.status(200).json(
            authSuccess(user, "Password updated successfully")
        )
    } catch (error) {
        console.error("Reset password error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const googleAuth = async (req, res) => {
    try {
        const { idToken } = req.body

        if (!idToken || typeof idToken !== "string") {
            return res.status(400).json({ message: "Google ID token is required" })
        }

        const trimmed = idToken.trim()
        /** Google ID tokens are JWTs: three base64url segments separated by dots */
        if (trimmed.split(".").length !== 3) {
            return res.status(400).json({
                message:
                    "idToken must be the credential JWT from Google Sign-In (three dot-separated parts). Do not send placeholders like \"test\"; use the token your client gets from google.accounts.id or the OAuth flow.",
            })
        }

        let googleProfile
        try {
            googleProfile = await verifyGoogleIdToken(trimmed)
        } catch (error) {
            if (error.code === "GOOGLE_NOT_CONFIGURED") {
                return res.status(503).json({ message: error.message })
            }
            console.error("Google token verification failed:", error.message)
            return res.status(401).json({ message: "Invalid Google sign-in" })
        }

        const { providerId, email } = googleProfile

        let user = await User.findOne({
            authProvider: "google",
            providerId,
            isActive: true,
        })

        if (user) {
            const token = generateUserToken(user)
            return res.status(200).json({
                message: "Login successful",
                token,
                user: formatUserResponse(user),
                isNewUser: false,
            })
        }

        const emailUser = await User.findOne({ email, isActive: true })
        if (emailUser) {
            return res.status(409).json({
                message:
                    "An account with this email already exists. Sign in with email and password.",
            })
        }

        user = await User.create({
            email,
            authProvider: "google",
            providerId,
            agreedToTermsAt: new Date(),
            accountId: await nextAccountId(),
            emailVerifiedAt: new Date(),
        })

        const token = generateUserToken(user)

        return res.status(201).json({
            message: "Account created successfully",
            token,
            user: formatUserResponse(user),
            isNewUser: true,
        })
    } catch (error) {
        if (error.code === 11000) {
            return res
                .status(409)
                .json({ message: "An account with this email already exists" })
        }
        console.error("Google auth error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const verifyEmail = async (req, res) => {
    try {
        const code = String(req.body?.code ?? req.body?.otp ?? "").trim()
        if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({ message: "A valid 6-digit code is required" })
        }

        if (req.user.emailVerifiedAt) {
            return res.status(200).json({
                message: "Email already verified",
                user: formatUserResponse(req.user),
            })
        }

        if (req.user.authProvider !== "email") {
            return res.status(400).json({
                message: "This account does not require email verification",
            })
        }

        const user = await User.findById(req.user._id).select(
            "+emailVerificationOtpHash +emailVerificationExpires"
        )
        if (!user) {
            return res.status(401).json({ message: "Account no longer exists" })
        }

        const codeHash = hashEmailVerificationOtp(code)
        if (
            !user.emailVerificationOtpHash ||
            user.emailVerificationOtpHash !== codeHash ||
            !user.emailVerificationExpires ||
            user.emailVerificationExpires <= new Date()
        ) {
            return res.status(400).json({
                message: "Invalid or expired verification code",
            })
        }

        user.emailVerifiedAt = new Date()
        user.emailVerificationOtpHash = undefined
        user.emailVerificationExpires = undefined
        await user.save()

        return res.status(200).json({
            message: "Email verified successfully",
            token: generateUserToken(user),
            user: formatUserResponse(user),
            requiresEmailVerification: false,
        })
    } catch (error) {
        console.error("Verify email error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const resendVerification = async (req, res) => {
    try {
        if (req.user.emailVerifiedAt) {
            return res.status(400).json({ message: "Email is already verified" })
        }

        if (req.user.authProvider !== "email") {
            return res.status(400).json({
                message: "This account does not require email verification",
            })
        }

        const user = await User.findById(req.user._id).select(
            "+emailVerificationSentAt"
        )
        if (!user) {
            return res.status(401).json({ message: "Account no longer exists" })
        }

        const waitSeconds = resendCooldownRemainingSeconds(user.emailVerificationSentAt)
        if (waitSeconds > 0) {
            return res.status(429).json({
                message: `Please wait ${waitSeconds}s before requesting another code`,
                resendAfterSeconds: waitSeconds,
            })
        }

        await issueAndSendEmailVerification(user)

        return res.status(200).json({
            message: "Verification code sent",
            resendAfterSeconds: 60,
        })
    } catch (error) {
        console.error("Resend verification error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res
                .status(400)
                .json({ message: "Email and password are required" })
        }

        const normalizedEmail = email.toLowerCase().trim()
        const admin = await Admin.findOne({ email: normalizedEmail, isActive: true })

        if (!admin) {
            return res.status(401).json({ message: "Invalid credentials" })
        }

        const isMatch = await admin.comparePassword(password)
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" })
        }

        const secret = process.env.JWT_SECRET
        if (!secret?.trim()) {
            throw new Error("JWT_SECRET is not configured")
        }
        const token = jwt.sign(
            { id: String(admin._id), kind: "admin" },
            secret,
            { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
        )

        return res.status(200).json({
            message: "Login successful",
            token,
            admin,
        })
    } catch (error) {
        console.error("Admin login error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const adminMe = async (req, res) => {
    return res.status(200).json({ admin: req.admin })
}
