import { applyStudioFieldsToUser } from "../utils/applyStudioFields.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import { parseStudioInput } from "../utils/studioFields.js"

const handleStudioError = (res, error) => {
    if (error.code === 11000) {
        return res
            .status(409)
            .json({ message: "This SMS display name is already taken" })
    }
    if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({ message: error.message })
    }
    console.error("Onboarding error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const completeOnboarding = async (req, res) => {
    try {
        const { fields, errors } = parseStudioInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        await applyStudioFieldsToUser(req.user, fields, {
            uploadedFile: req.file,
        })
        await req.user.save()

        return res.status(200).json({
            message: "Studio profile saved",
            user: formatUserResponse(req.user),
        })
    } catch (error) {
        return handleStudioError(res, error)
    }
}

export const updateStudio = async (req, res) => {
    try {
        const { fields, errors } = parseStudioInput(req.body, { partial: true })
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        if (fields.companyName !== undefined && !fields.companyName) {
            return res
                .status(400)
                .json({ message: "Studio / company name is required" })
        }
        if (fields.phone !== undefined && !fields.phone) {
            return res.status(400).json({ message: "Business phone is required" })
        }
        if (fields.companySlug !== undefined && !fields.companySlug) {
            return res.status(400).json({ message: "Studio URL slug is required" })
        }
        if (fields.primaryDeliverable !== undefined && !fields.primaryDeliverable) {
            return res.status(400).json({ message: "Primary deliverable is required" })
        }
        if (fields.country !== undefined && !fields.country) {
            return res.status(400).json({ message: "Country is required" })
        }

        await applyStudioFieldsToUser(req.user, fields, {
            uploadedFile: req.file,
            partial: true,
        })
        await req.user.save()

        return res.status(200).json({
            message: "Studio profile updated",
            user: formatUserResponse(req.user),
        })
    } catch (error) {
        return handleStudioError(res, error)
    }
}

export const getStudio = async (req, res) => {
    return res.status(200).json({ user: formatUserResponse(req.user) })
}
