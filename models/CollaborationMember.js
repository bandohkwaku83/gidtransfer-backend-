import mongoose from "mongoose"

export const MEMBER_ROLES = ["editor", "viewer"]
export const MEMBER_STATUSES = ["invited", "active", "removed"]

const collaborationMemberSchema = new mongoose.Schema(
    {
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CollaborationWorkspace",
            required: true,
            index: true,
        },
        /** Always a registered User — invitees must already have an account. */
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        /** Denormalized for emails / display. */
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 320,
        },
        role: {
            type: String,
            enum: MEMBER_ROLES,
            default: "editor",
        },
        status: {
            type: String,
            enum: MEMBER_STATUSES,
            default: "invited",
            index: true,
        },
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        inviteTokenHash: {
            type: String,
            default: null,
            index: true,
        },
        inviteExpiresAt: {
            type: Date,
            default: null,
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        removedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
)

collaborationMemberSchema.index({ workspace: 1, user: 1 }, { unique: true })
collaborationMemberSchema.index({ user: 1, status: 1 })
collaborationMemberSchema.index({ workspace: 1, status: 1 })

const CollaborationMember = mongoose.model(
    "CollaborationMember",
    collaborationMemberSchema
)

export default CollaborationMember
