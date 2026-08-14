import mongoose from "mongoose"

const adminAuditLogSchema = new mongoose.Schema(
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
        adminRole: {
            type: String,
            trim: true,
            default: "admin",
        },
        action: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        reason: {
            type: String,
            trim: true,
            default: "",
        },
        resourceType: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        resourceId: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
)

adminAuditLogSchema.index({ createdAt: -1 })

const AdminAuditLog = mongoose.model("AdminAuditLog", adminAuditLogSchema)

export default AdminAuditLog
