import {
    deleteStudioLogoFile,
    saveStudioLogoFile,
    validateLogoFile,
} from "./studioLogoStorage.js"
import {
    deleteUserAvatarFile,
    saveUserAvatarFile,
    validateAvatarFile,
} from "./userAvatarStorage.js"
import {
    assignCompanySlug,
    ensureUserCompanySlug,
} from "./gallerySlugHelpers.js"
import { applySmsSenderIdToStudio } from "./applySmsSenderFields.js"

export const applySettingsFieldsToUser = async (
    user,
    fields,
    { uploadedLogo, uploadedAvatar, partial = true } = {}
) => {
    const studio = user.studio ?? {}
    const previousLogoUrl = studio.logoUrl || ""
    const previousAvatarUrl = user.avatarUrl || ""

    if (fields.companyName !== undefined) {
        studio.companyName = fields.companyName
    }
    if (fields.phone !== undefined) {
        studio.phone = fields.phone
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

    if (uploadedLogo) {
        const logoError = validateLogoFile(uploadedLogo)
        if (logoError) {
            const err = new Error(logoError)
            err.statusCode = 400
            throw err
        }
        studio.logoUrl = await saveStudioLogoFile(
            user._id.toString(),
            uploadedLogo
        )
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

    if (uploadedAvatar) {
        const avatarError = validateAvatarFile(uploadedAvatar)
        if (avatarError) {
            const err = new Error(avatarError)
            err.statusCode = 400
            throw err
        }
        user.avatarUrl = await saveUserAvatarFile(
            user._id.toString(),
            uploadedAvatar
        )
        user.avatarDataUrl = ""
        if (previousAvatarUrl && previousAvatarUrl !== user.avatarUrl) {
            deleteUserAvatarFile(previousAvatarUrl)
        }
    } else if (fields.avatarDataUrl !== undefined) {
        if (fields.avatarDataUrl) {
            user.avatarDataUrl = fields.avatarDataUrl
            if (previousAvatarUrl) {
                deleteUserAvatarFile(previousAvatarUrl)
                user.avatarUrl = ""
            }
        } else if (fields.clearAvatar) {
            user.avatarDataUrl = ""
            deleteUserAvatarFile(previousAvatarUrl)
            user.avatarUrl = ""
        }
    }

    user.studio = studio

    if (fields.emailNotifications !== undefined) {
        user.emailNotifications = fields.emailNotifications
    }

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
