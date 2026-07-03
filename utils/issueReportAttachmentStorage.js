import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { randomUUID } from "crypto"

export const MAX_ISSUE_ATTACHMENT_BYTES = 5_242_880
export const MAX_ISSUE_ATTACHMENTS = 5

export const issueAttachmentSizeErrorMessage = () =>
    "Each attachment must be 5MB or smaller"

export const ISSUE_REPORTS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "uploads",
    "issue-reports"
)

const ALLOWED_MIME = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "application/pdf",
])

export const ensureIssueReportsDir = (reportId) => {
    const dir = path.join(ISSUE_REPORTS_DIR, String(reportId))
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

export const extensionForMime = (mime) => {
    if (mime === "image/png") return ".png"
    if (mime === "image/webp") return ".webp"
    if (mime === "image/gif") return ".gif"
    if (mime === "application/pdf") return ".pdf"
    return ".jpg"
}

export const validateIssueAttachmentFile = (file) => {
    if (!file) return null
    if (!ALLOWED_MIME.has(file.mimetype)) {
        return "Attachments must be PNG, JPG, WebP, GIF, or PDF"
    }
    if (file.size > MAX_ISSUE_ATTACHMENT_BYTES) {
        return issueAttachmentSizeErrorMessage()
    }
    return null
}

export const relativeIssueAttachmentUrl = (reportId, filename) =>
    `/uploads/issue-reports/${reportId}/${filename}`

export const saveIssueAttachmentFiles = async (reportId, files = []) => {
    if (!files.length) return []

    ensureIssueReportsDir(reportId)
    const saved = []

    for (const file of files) {
        const error = validateIssueAttachmentFile(file)
        if (error) {
            const err = new Error(error)
            err.statusCode = 400
            throw err
        }

        const ext = extensionForMime(file.mimetype)
        const filename = `${randomUUID()}${ext}`
        const dest = path.join(ISSUE_REPORTS_DIR, String(reportId), filename)
        await fs.promises.writeFile(dest, file.buffer)

        saved.push({
            filename,
            originalName: file.originalname?.trim() || filename,
            mimeType: file.mimetype,
            sizeBytes: file.size,
            url: relativeIssueAttachmentUrl(reportId, filename),
        })
    }

    return saved
}

export const deleteIssueReportAttachments = (reportId) => {
    const dir = path.join(ISSUE_REPORTS_DIR, String(reportId))
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    } catch {
        /* ignore cleanup errors */
    }
}
