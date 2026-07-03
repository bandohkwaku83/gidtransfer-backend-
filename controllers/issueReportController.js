import IssueReport from "../models/IssueReport.js"
import { ensureUserAccountId } from "../utils/accountId.js"
import {
    formatIssueReportFormResponse,
    formatIssueReportResponse,
    parseIssueReportInput,
} from "../utils/issueReportFields.js"
import {
    deleteIssueReportAttachments,
    saveIssueAttachmentFiles,
} from "../utils/issueReportAttachmentStorage.js"
import { issueReportUploadedFiles } from "../middleware/uploadIssueReport.js"

const handleIssueReportError = (res, error) => {
    if (error.statusCode === 400 || error.statusCode === 409) {
        return res.status(error.statusCode).json({ message: error.message })
    }
    console.error("Issue report error:", error)
    return res.status(500).json({ message: "Server error" })
}

export const getIssueReportForm = async (_req, res) => {
    try {
        return res.status(200).json({
            helpSupport: formatIssueReportFormResponse(),
            reportIssue: formatIssueReportFormResponse(),
        })
    } catch (error) {
        return handleIssueReportError(res, error)
    }
}

export const submitIssueReport = async (req, res) => {
    let report = null

    try {
        const { fields, errors } = parseIssueReportInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        await ensureUserAccountId(req.user)

        const uploadedFiles = issueReportUploadedFiles(req)

        report = await IssueReport.create({
            owner: req.user._id,
            accountId: req.user.accountId?.trim() || "",
            userEmail: req.user.email,
            topic: fields.topic,
            description: fields.description,
            attachments: [],
        })

        if (uploadedFiles.length) {
            const attachments = await saveIssueAttachmentFiles(
                report._id.toString(),
                uploadedFiles
            )
            report.attachments = attachments
            await report.save()
        }

        if (process.env.NODE_ENV !== "production") {
            console.log(
                `[issue-report] ${req.user.email}: ${report._id} (${report.attachments.length} attachment(s))`
            )
        }

        return res.status(201).json({
            message: "Report submitted",
            report: formatIssueReportResponse(report),
        })
    } catch (error) {
        if (report?._id) {
            await IssueReport.deleteOne({ _id: report._id }).catch(() => {})
            deleteIssueReportAttachments(report._id)
        }

        if (error.name === "ValidationError") {
            const message = Object.values(error.errors)[0]?.message
            return res.status(400).json({ message: message || "Invalid input" })
        }
        return handleIssueReportError(res, error)
    }
}
