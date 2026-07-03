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

export const applyStudioFieldsToUser = async (
    user,
    fields,
    { uploadedFile, partial = false } = {}
) => {
    const studio = user.studio ?? {}
    const previousLogoUrl = studio.logoUrl || ""

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

    return user
}
