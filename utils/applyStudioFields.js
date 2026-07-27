import User from "../models/User.js"
import {
    deleteStudioLogoFile,
    saveStudioLogoFile,
    validateLogoFile,
} from "./studioLogoStorage.js"
import {
    assignCompanySlug,
    ensureUserCompanySlug,
} from "./gallerySlugHelpers.js"
import { applySmsSenderIdToStudio } from "./applySmsSenderFields.js"
import {
    createEmailVerificationOtp,
    EMAIL_VERIFICATION_EXPIRY_MS,
} from "./emailVerification.js"
import { sendEmailVerificationOtp } from "./photographerNotifications.js"

const assertEmailAvailable = async (email, { excludeUserId } = {}) => {
    const filter = { email }
    if (excludeUserId) {
        filter._id = { $ne: excludeUserId }
    }
    const existing = await User.findOne(filter).select("_id")
    if (existing) {
        const err = new Error("An account with this email already exists")
        err.statusCode = 409
        throw err
    }
}

/** @returns {Promise<boolean>} true when the login email changed */
export const applyPhotographerEmailChange = async (user, nextEmail) => {
    const current = user.email?.trim().toLowerCase() || ""
    if (!nextEmail || nextEmail === current) return false

    await assertEmailAvailable(nextEmail, { excludeUserId: user._id })
    user.email = nextEmail

    // Re-verify when the login identity changes for email/password accounts.
    if (user.authProvider === "email") {
        user.emailVerifiedAt = undefined
        const { code, hash } = createEmailVerificationOtp()
        user.emailVerificationOtpHash = hash
        user.emailVerificationExpires = new Date(
            Date.now() + EMAIL_VERIFICATION_EXPIRY_MS
        )
        user.emailVerificationSentAt = new Date()
        try {
            const result = await sendEmailVerificationOtp({
                email: nextEmail,
                code,
            })
            if (result?.dryRun && process.env.NODE_ENV !== "production") {
                console.log(`[email-verification] ${nextEmail}: ${code}`)
            }
        } catch (error) {
            console.error(
                `[email-verification] email failed for ${nextEmail}:`,
                error?.message || error
            )
            if (process.env.NODE_ENV !== "production") {
                console.log(`[email-verification] ${nextEmail}: ${code}`)
            }
        }
    }

    return true
}

export const applyStudioFieldsToUser = async (
    user,
    fields,
    { uploadedFile, partial = false } = {}
) => {
    const studio = user.studio ?? {}
    const previousLogoUrl = studio.logoUrl || ""
    let emailChanged = false

    if (fields.email !== undefined) {
        emailChanged = await applyPhotographerEmailChange(user, fields.email)
    }

    if (fields.companyName !== undefined) {
        studio.companyName = fields.companyName
    }
    if (fields.phone !== undefined) {
        studio.phone = fields.phone
    }
    if (fields.primaryDeliverable !== undefined) {
        studio.primaryDeliverable = fields.primaryDeliverable
    }
    if (fields.country !== undefined) {
        studio.country = fields.country
    }
    if (fields.referralCode !== undefined) {
        studio.referralCode = fields.referralCode
    }
    if (fields.website !== undefined) {
        studio.website = fields.website
    }

    if (fields.smsSenderId !== undefined) {
        await applySmsSenderIdToStudio(studio, fields.smsSenderId, {
            userId: user._id,
            partial,
        })
    }

    if (uploadedFile) {
        const logoError = validateLogoFile(uploadedFile)
        if (logoError) {
            const err = new Error(logoError)
            err.statusCode = 400
            throw err
        }
        studio.logoUrl = await saveStudioLogoFile(user._id.toString(), uploadedFile)
        studio.logoDataUrl = ""
        if (previousLogoUrl && previousLogoUrl !== studio.logoUrl) {
            deleteStudioLogoFile(previousLogoUrl)
        }
    } else if (fields.logoDataUrl !== undefined) {
        if (fields.logoDataUrl) {
            studio.logoDataUrl = fields.logoDataUrl
            if (previousLogoUrl) {
                deleteStudioLogoFile(previousLogoUrl)
                studio.logoUrl = ""
            }
        } else if (fields.clearLogo) {
            studio.logoDataUrl = ""
            deleteStudioLogoFile(previousLogoUrl)
            studio.logoUrl = ""
        }
    }

    user.studio = studio

    if (fields.companySlug !== undefined) {
        await assignCompanySlug(user, fields.companySlug)
    } else if (studio.companyName?.trim() && !studio.companySlug?.trim()) {
        await ensureUserCompanySlug(user)
    }

    const hasOnboardingBasics =
        studio.companyName?.trim() &&
        studio.phone?.trim() &&
        studio.companySlug?.trim() &&
        studio.primaryDeliverable?.trim() &&
        studio.country?.trim() &&
        studio.smsSenderId?.trim()

    if (hasOnboardingBasics) {
        user.onboardingCompletedAt = user.onboardingCompletedAt ?? new Date()
    }

    return { user, emailChanged }
}
