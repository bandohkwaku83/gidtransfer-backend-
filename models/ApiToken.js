import mongoose from "mongoose"

const apiTokenSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        name: {
            type: String,
            trim: true,
            required: true,
            maxlength: 80,
        },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
            select: false,
        },
        tokenPrefix: {
            type: String,
            trim: true,
            required: true,
        },
        lastUsedAt: {
            type: Date,
            default: null,
        },
        revokedAt: {
            type: Date,
            default: null,
            index: true,
        },
    },
    { timestamps: true }
)

apiTokenSchema.index({ owner: 1, revokedAt: 1 })

const ApiToken = mongoose.model("ApiToken", apiTokenSchema)

export default ApiToken
