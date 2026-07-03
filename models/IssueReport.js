import mongoose from "mongoose"

export const ISSUE_REPORT_TOPICS = [
    "not_working",
    "billing",
    "feature_request",
    "account",
    "other",
]

const issueAttachmentSchema = new mongoose.Schema(
    {
        filename: { type: String, required: true, trim: true },
        originalName: { type: String, default: "", trim: true },
        mimeType: { type: String, default: "", trim: true },
        sizeBytes: { type: Number, default: 0, min: 0 },
        url: { type: String, required: true, trim: true },
    },
    { _id: false }
)

const issueReportSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        accountId: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        userEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        topic: {
            type: String,
            required: true,
            enum: ISSUE_REPORT_TOPICS,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        attachments: {
            type: [issueAttachmentSchema],
            default: [],
        },
        status: {
            type: String,
            enum: ["open", "resolved"],
            default: "open",
        },
    },
    { timestamps: true }
)

issueReportSchema.index({ owner: 1, createdAt: -1 })

const IssueReport = mongoose.model("IssueReport", issueReportSchema)

export default IssueReport
