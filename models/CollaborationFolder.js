import mongoose from "mongoose"

const collaborationFolderSchema = new mongoose.Schema(
    {
        workspace: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CollaborationWorkspace",
            required: true,
            index: true,
        },
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
            maxlength: 80,
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
)

collaborationFolderSchema.index({ workspace: 1, sortOrder: 1 })

const CollaborationFolder = mongoose.model(
    "CollaborationFolder",
    collaborationFolderSchema
)

export default CollaborationFolder
