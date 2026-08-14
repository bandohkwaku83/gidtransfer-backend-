import mongoose from "mongoose"
import ApiToken from "../models/ApiToken.js"
import {
    countActiveApiTokens,
    formatApiTokenResponse,
    generateApiTokenSecret,
    MAX_API_TOKENS_PER_USER,
} from "../utils/apiTokens.js"

const handleError = (res, error) => {
    console.error("API token error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const listApiTokens = async (req, res) => {
    try {
        const rows = await ApiToken.find({
            owner: req.user._id,
            revokedAt: null,
        })
            .sort({ createdAt: -1 })
            .lean()

        return res.status(200).json({
            tokens: rows.map(formatApiTokenResponse),
            available: true,
            limit: MAX_API_TOKENS_PER_USER,
        })
    } catch (error) {
        return handleError(res, error)
    }
}

export const createApiToken = async (req, res) => {
    try {
        const name = String(req.body?.name ?? req.body?.label ?? "API token").trim()
        if (!name) {
            return res.status(400).json({ message: "name is required" })
        }
        if (name.length > 80) {
            return res.status(400).json({ message: "name must be 80 characters or fewer" })
        }

        const active = await countActiveApiTokens(req.user._id)
        if (active >= MAX_API_TOKENS_PER_USER) {
            return res.status(400).json({
                message: `You can have at most ${MAX_API_TOKENS_PER_USER} active API tokens`,
            })
        }

        const { token, tokenHash, tokenPrefix } = generateApiTokenSecret()
        const doc = await ApiToken.create({
            owner: req.user._id,
            name,
            tokenHash,
            tokenPrefix,
        })

        return res.status(201).json({
            message: "API token created",
            token,
            apiToken: formatApiTokenResponse(doc),
        })
    } catch (error) {
        return handleError(res, error)
    }
}

export const revokeApiToken = async (req, res) => {
    try {
        const { tokenId } = req.params
        if (!mongoose.isValidObjectId(tokenId)) {
            return res.status(400).json({ message: "Invalid token id" })
        }

        const doc = await ApiToken.findOne({
            _id: tokenId,
            owner: req.user._id,
            revokedAt: null,
        })
        if (!doc) {
            return res.status(404).json({ message: "API token not found" })
        }

        doc.revokedAt = new Date()
        await doc.save()

        return res.status(200).json({
            message: "API token revoked",
            apiToken: formatApiTokenResponse(doc),
        })
    } catch (error) {
        return handleError(res, error)
    }
}
