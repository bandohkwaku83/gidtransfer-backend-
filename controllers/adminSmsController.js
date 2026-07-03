import User from "../models/User.js"
import { formatUserResponse } from "../utils/formatUserResponse.js"
import {
    approveStudioSmsSender,
    rejectStudioSmsSender,
} from "../utils/studioSms.js"

const formatAdminStudioSmsRow = (user) => {
    const studio = user.studio ?? {}
    return {
        userId: user._id,
        accountId: user.accountId ?? null,
        email: user.email,
        companyName: studio.companyName?.trim() || "",
        smsSenderId: studio.smsSenderId?.trim() || "",
        smsSenderStatus: studio.smsSenderStatus || "none",
        smsSenderRequestedAt: studio.smsSenderRequestedAt ?? null,
        smsSenderApprovedAt: studio.smsSenderApprovedAt ?? null,
        smsSenderRejectedReason: studio.smsSenderRejectedReason?.trim() || "",
    }
}

export const listStudioSenderIds = async (req, res) => {
    try {
        const status = String(req.query.status || "pending").trim()
        const filter = {
            "studio.smsSenderId": { $ne: "" },
        }
        if (status !== "all") {
            filter["studio.smsSenderStatus"] = status
        }

        const users = await User.find(filter)
            .select("email accountId studio")
            .sort({ "studio.smsSenderRequestedAt": -1, createdAt: -1 })
            .limit(200)

        return res.status(200).json({
            items: users.map(formatAdminStudioSmsRow),
        })
    } catch (error) {
        console.error("listStudioSenderIds:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const approveStudioSenderId = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
        if (!user) {
            return res.status(404).json({ message: "User not found" })
        }

        approveStudioSmsSender(user.studio)
        await user.save()

        return res.status(200).json({
            message: "SMS display name approved",
            user: formatUserResponse(user),
        })
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message })
        }
        console.error("approveStudioSenderId:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const rejectStudioSenderId = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId)
        if (!user) {
            return res.status(404).json({ message: "User not found" })
        }

        rejectStudioSmsSender(user.studio, req.body?.reason)
        await user.save()

        return res.status(200).json({
            message: "SMS display name rejected",
            user: formatUserResponse(user),
        })
    } catch (error) {
        if (error.statusCode === 400) {
            return res.status(400).json({ message: error.message })
        }
        console.error("rejectStudioSenderId:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
