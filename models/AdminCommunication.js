import mongoose from "mongoose"

const recipientSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        accountId: { type: String, trim: true, default: "" },
        email: { type: String, trim: true, default: "" },
        phone: { type: String, trim: true, default: "" },
        companyName: { type: String, trim: true, default: "" },
        status: {
            type: String,
            enum: ["sent", "failed", "skipped"],
            required: true,
        },
        error: { type: String, trim: true, default: "" },
        skipReason: { type: String, trim: true, default: "" },
    },
    { _id: false }
)

const adminCommunicationSchema = new mongoose.Schema(
    {
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
            index: true,
        },
        adminEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        channel: {
            type: String,
            enum: ["sms", "email"],
            required: true,
            index: true,
        },
        subject: {
            type: String,
            trim: true,
            default: "",
        },
        message: {
            type: String,
            required: true,
            trim: true,
        },
        recipients: {
            type: [recipientSchema],
            default: [],
        },
        summary: {
            targeted: { type: Number, default: 0, min: 0 },
            sent: { type: Number, default: 0, min: 0 },
            failed: { type: Number, default: 0, min: 0 },
            skipped: { type: Number, default: 0, min: 0 },
        },
    },
    { timestamps: true }
)

adminCommunicationSchema.index({ createdAt: -1 })

const AdminCommunication = mongoose.model(
    "AdminCommunication",
    adminCommunicationSchema
)

export default AdminCommunication
