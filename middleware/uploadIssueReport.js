import multer from "multer"
import {
    issueAttachmentSizeErrorMessage,
    MAX_ISSUE_ATTACHMENT_BYTES,
    MAX_ISSUE_ATTACHMENTS,
} from "../utils/issueReportAttachmentStorage.js"

const storage = multer.memoryStorage()

const upload = multer({
    storage,
    limits: {
        fileSize: MAX_ISSUE_ATTACHMENT_BYTES,
        files: MAX_ISSUE_ATTACHMENTS,
    },
})

export const uploadIssueReportAttachments = upload.fields([
    { name: "attachments", maxCount: MAX_ISSUE_ATTACHMENTS },
    { name: "attachment", maxCount: 1 },
    { name: "screenshot", maxCount: 1 },
    { name: "file", maxCount: 1 },
    { name: "image", maxCount: 1 },
])

export const issueReportUploadedFiles = (req) => {
    const files = [
        ...(req.files?.attachments ?? []),
        ...(req.files?.attachment ?? []),
        ...(req.files?.screenshot ?? []),
        ...(req.files?.file ?? []),
        ...(req.files?.image ?? []),
    ]

    return files.slice(0, MAX_ISSUE_ATTACHMENTS)
}

export const handleUploadIssueReport = (req, res, next) => {
    uploadIssueReportAttachments(req, res, (err) => {
        if (!err) return next()
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                message: issueAttachmentSizeErrorMessage(),
            })
        }
        if (err.code === "LIMIT_FILE_COUNT") {
            return res.status(400).json({
                message: `You can attach up to ${MAX_ISSUE_ATTACHMENTS} files`,
            })
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
            return res.status(400).json({
                message:
                    "Attachments must use form fields attachments, attachment, screenshot, file, or image",
            })
        }
        return res.status(400).json({
            message: err.message || "Invalid attachment upload",
        })
    })
}
