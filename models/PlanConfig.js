import mongoose from "mongoose"

/**
 * Optional per-plan overrides layered on top of code defaults in planCatalog.
 * One document per plan id (free, basic, pro, premium).
 */
const planConfigSchema = new mongoose.Schema(
    {
        planId: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        name: {
            type: String,
            trim: true,
            default: null,
        },
        description: {
            type: String,
            trim: true,
            default: null,
        },
        /** Alias stored as storageLimitBytes in API responses. */
        storageLimitBytes: {
            type: Number,
            default: null,
            min: 0,
        },
        maxGalleries: {
            type: Number,
            default: null,
            min: 0,
        },
        priceGhs: {
            type: Number,
            default: null,
            min: 0,
        },
        yearlyPriceGhs: {
            type: Number,
            default: null,
            min: 0,
        },
        perks: {
            type: [String],
            default: undefined,
        },
        featureKeys: {
            type: [String],
            default: undefined,
        },
        maxTeamMembers: {
            type: Number,
            default: null,
            min: 0,
        },
        videoUploadLimitBytes: {
            type: Number,
            default: null,
            min: 0,
        },
        supportTier: {
            type: String,
            trim: true,
            default: null,
        },
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        updatedByEmail: {
            type: String,
            trim: true,
            default: "",
        },
    },
    { timestamps: true }
)

const PlanConfig = mongoose.model("PlanConfig", planConfigSchema)

export default PlanConfig
