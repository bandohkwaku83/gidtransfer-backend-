import { ISSUE_REPORT_TOPICS } from "../models/IssueReport.js"
import { resolveMediaUrl } from "./formatUserResponse.js"
import { MAX_ISSUE_ATTACHMENTS } from "./issueReportAttachmentStorage.js"

export const ISSUE_TOPIC_LABELS = {
    not_working: "Something isn't working",
    billing: "Billing or plan",
    feature_request: "Feature request",
    account: "Account or login",
    other: "Something else",
}

const MIN_DESCRIPTION_LENGTH = 10
const MAX_DESCRIPTION_LENGTH = 5000

const normalizeTopic = (value) => {
    if (value === undefined || value === null) return ""
    const raw = String(value).trim()
    if (!raw) return ""

    const byId = raw.toLowerCase().replace(/\s+/g, "_")
    if (ISSUE_REPORT_TOPICS.includes(byId)) return byId

    const match = Object.entries(ISSUE_TOPIC_LABELS).find(
        ([, label]) => label.toLowerCase() === raw.toLowerCase()
    )
    return match?.[0] ?? ""
}

export const listIssueReportTopics = () =>
    ISSUE_REPORT_TOPICS.map((id) => ({
        id,
        label: ISSUE_TOPIC_LABELS[id],
    }))

export const parseIssueReportInput = (body) => {
    const errors = []
    const topic = normalizeTopic(body.topic ?? body.issueTopic ?? body.subject)
    const description = (
        body.description ??
        body.message ??
        body.whatWentWrong ??
        body.what_went_wrong ??
        ""
    ).trim()

    if (!topic) {
        errors.push("Topic is required")
    } else if (!ISSUE_REPORT_TOPICS.includes(topic)) {
        errors.push("Invalid topic")
    }

    if (!description) {
        errors.push("Please describe what went wrong")
    } else if (description.length < MIN_DESCRIPTION_LENGTH) {
        errors.push(
            `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`
        )
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
        errors.push(
            `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`
        )
    }

    if (errors.length) {
        return { fields: null, errors }
    }

    return {
        fields: { topic, description },
        errors: [],
    }
}

export const formatIssueReportAttachment = (attachment) => ({
    filename: attachment.filename,
    originalName: attachment.originalName ?? attachment.filename,
    mimeType: attachment.mimeType ?? "",
    sizeBytes: attachment.sizeBytes ?? 0,
    url: resolveMediaUrl(attachment.url),
})

export const formatIssueReportResponse = (report) => {
    const doc = report.toJSON ? report.toJSON() : report
    const attachments = (doc.attachments ?? []).map(formatIssueReportAttachment)

    return {
        id: String(doc._id),
        topic: doc.topic,
        topicLabel: ISSUE_TOPIC_LABELS[doc.topic] ?? doc.topic,
        description: doc.description,
        attachments,
        attachmentCount: attachments.length,
        status: doc.status,
        createdAt: doc.createdAt,
    }
}

export const formatIssueReportFormResponse = () => ({
    title: "Report an issue",
    subtitle: "Tell us what happened. You can attach screenshots or files below.",
    topics: listIssueReportTopics(),
    descriptionPlaceholder:
        "What were you trying to do? What did you expect? What happened instead?",
    attachments: {
        enabled: true,
        maxCount: MAX_ISSUE_ATTACHMENTS,
        maxSizeBytes: 5_242_880,
        acceptedTypes: ["PNG", "JPG", "WebP", "GIF", "PDF"],
        hint: "Optional — attach up to 5 screenshots or files (5MB each).",
    },
})
