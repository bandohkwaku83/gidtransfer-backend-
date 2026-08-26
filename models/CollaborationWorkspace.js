import mongoose from "mongoose"

export const WORKSPACE_STATUSES = ["active", "archived"]

const collaborationWorkspaceSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            trim: true,
            default: "",
            maxlength: 2000,
        },
        status: {
            type: String,
            enum: WORKSPACE_STATUSES,
            default: "active",
            index: true,
        },
        /** Optional link to a client gallery for later delivery. */
        linkedGallery: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Gallery",
            default: null,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
            index: true,
        },
    },
    { timestamps: true }
)

collaborationWorkspaceSchema.index({ owner: 1, deletedAt: 1, status: 1 })
collaborationWorkspaceSchema.index({ owner: 1, name: 1 })

const CollaborationWorkspace = mongoose.model(
    "CollaborationWorkspace",
    collaborationWorkspaceSchema
)

export default CollaborationWorkspace
