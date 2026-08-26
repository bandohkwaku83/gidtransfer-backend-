import mongoose from "mongoose"

const TRASH_RESTORE_DAYS = 30

const collaborationAssetSchema = new mongoose.Schema(
    {
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CollaborationWorkspace",
            required: true,
            index: true,
        },
        /** Billing / storage attribution — always the workspace owner. */
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        folder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CollaborationFolder",
            default: null,
            index: true,
        },
        originalFilename: {
            type: String,
            required: true,
            trim: true,
        },
        storedFilename: {
            type: String,
            required: true,
        },
        thumbStoredFilename: {
            type: String,
            default: null,
        },
        previewStoredFilename: {
            type: String,
            default: null,
        },
        url: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        sizeBytes: {
            type: Number,
            required: true,
        },
        isVideo: {
            type: Boolean,
            default: false,
        },
        sortOrder: {
            type: Number,
            default: 0,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
            index: true,
        },
        restoreDeadline: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
)

collaborationAssetSchema.index({ workspace: 1, deletedAt: 1, sortOrder: 1 })
collaborationAssetSchema.index({ owner: 1, deletedAt: 1 })

collaborationAssetSchema.statics.trashRestoreDays = () => TRASH_RESTORE_DAYS

const CollaborationAsset = mongoose.model(
    "CollaborationAsset",
    collaborationAssetSchema
)

export default CollaborationAsset
