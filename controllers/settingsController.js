import { applySettingsFieldsToUser } from "../utils/applySettingsFields.js"
import { ensureUserAccountId } from "../utils/accountId.js"
import { formatSettingsResponse } from "../utils/formatSettingsResponse.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import {
    attachGalleryCounts,
    galleryNotDeletedFilter,
    galleryOwnerFilter,
} from "../utils/galleryFields.js"
import Gallery from "../models/Gallery.js"
import { parseSettingsInput } from "../utils/settingsFields.js"
import { getOwnerStorageBreakdown } from "../utils/storageUsage.js"
import { settingsUploadedFiles } from "../middleware/uploadSettings.js"

const handleSettingsError = (res, error) => {
    if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({ message: error.message })
    }
    console.error("Settings error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const getSettings = async (req, res) => {
    try {
        await ensureUserAccountId(req.user)

        const [galleryCount, storageBreakdown] = await Promise.all([
            Gallery.countDocuments({
                ...galleryOwnerFilter(req.user._id),
                ...galleryNotDeletedFilter(),
            }),
            getOwnerStorageBreakdown(req.user._id),
        ])

        return res.status(200).json({
            settings: formatSettingsResponse({
                user: req.user,
                galleryCount,
                storageUsedBytes: storageBreakdown.totalBytes,
            }),
            user: formatUserResponse(req.user),
        })
    } catch (error) {
        return handleSettingsError(res, error)
    }
}

export const updateSettings = async (req, res) => {
    try {
        const { fields, errors } = parseSettingsInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        if (!fields || Object.keys(fields).length === 0) {
            const hasUpload =
                settingsUploadedFiles(req).uploadedLogo ||
                settingsUploadedFiles(req).uploadedAvatar
            if (!hasUpload) {
                return res.status(400).json({ message: "No changes to save" })
            }
        }

        await applySettingsFieldsToUser(req.user, fields ?? {}, {
            ...settingsUploadedFiles(req),
        })
        await req.user.save()
        await ensureUserAccountId(req.user)

        const [galleryCount, storageBreakdown] = await Promise.all([
            Gallery.countDocuments({
                ...galleryOwnerFilter(req.user._id),
                ...galleryNotDeletedFilter(),
            }),
            getOwnerStorageBreakdown(req.user._id),
        ])

        return res.status(200).json({
            message: "Profile saved",
            settings: formatSettingsResponse({
                user: req.user,
                galleryCount,
                storageUsedBytes: storageBreakdown.totalBytes,
            }),
            user: formatUserResponse(req.user),
        })
    } catch (error) {
        return handleSettingsError(res, error)
    }
}

export const getSettingsOverview = async (req, res) => {
    try {
        await ensureUserAccountId(req.user)

        const [counts, storageBreakdown] = await Promise.all([
            attachGalleryCounts(req.user._id),
            getOwnerStorageBreakdown(req.user._id),
        ])

        const settings = formatSettingsResponse({
            user: req.user,
            galleryCount: counts.all,
            storageUsedBytes: storageBreakdown.totalBytes,
        })

        return res.status(200).json({
            overview: settings.overview,
            profile: {
                planName: settings.profile.planName,
                profileComplete: settings.profile.profileComplete,
                profileStatusLabel: settings.profile.profileStatusLabel,
            },
        })
    } catch (error) {
        return handleSettingsError(res, error)
    }
}

export const getSettingsAccount = async (req, res) => {
    try {
        await ensureUserAccountId(req.user)
        const settings = formatSettingsResponse({ user: req.user })
        return res.status(200).json({ account: settings.account })
    } catch (error) {
        return handleSettingsError(res, error)
    }
}

export const getSettingsStudio = async (req, res) => {
    try {
        const settings = formatSettingsResponse({ user: req.user })
        return res.status(200).json({ studio: settings.studio })
    } catch (error) {
        return handleSettingsError(res, error)
    }
}

export const getSettingsProfile = async (req, res) => {
    try {
        await ensureUserAccountId(req.user)

        const [galleryCount, storageBreakdown] = await Promise.all([
            Gallery.countDocuments({
                ...galleryOwnerFilter(req.user._id),
                ...galleryNotDeletedFilter(),
            }),
            getOwnerStorageBreakdown(req.user._id),
        ])

        const settings = formatSettingsResponse({
            user: req.user,
            galleryCount,
            storageUsedBytes: storageBreakdown.totalBytes,
        })

        return res.status(200).json({
            profile: settings.profile,
            overview: settings.overview,
        })
    } catch (error) {
        return handleSettingsError(res, error)
    }
}
