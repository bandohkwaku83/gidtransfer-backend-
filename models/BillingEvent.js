import mongoose from "mongoose"

/**
 * Paystack webhook idempotency + admin billing timeline.
 * Categories map to paid / failed / dispute style events.
 */
const billingEventSchema = new mongoose.Schema(
    {
        eventId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        eventType: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        /** Normalized admin category: paid | failed | dispute | other */
        category: {
            type: String,
            enum: ["paid", "failed", "dispute", "other"],
            default: "other",
            index: true,
        },
        reference: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true,
        },
        amount: {
            type: Number,
            default: null,
        },
        currency: {
            type: String,
            trim: true,
            default: "",
        },
        status: {
            type: String,
            trim: true,
            default: "",
        },
        processedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
)

billingEventSchema.index({ createdAt: -1 })
billingEventSchema.index({ category: 1, createdAt: -1 })

const BillingEvent = mongoose.model("BillingEvent", billingEventSchema)

export default BillingEvent
