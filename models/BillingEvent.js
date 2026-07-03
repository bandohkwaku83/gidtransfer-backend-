import mongoose from "mongoose"

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
        },
        reference: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        processedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true }
)

const BillingEvent = mongoose.model("BillingEvent", billingEventSchema)

export default BillingEvent
