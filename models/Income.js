import mongoose from "mongoose"

const INCOME_STATUSES = ["paid", "pending", "partial", "invoiced"]

const incomeSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        client: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Client",
            required: true,
            index: true,
        },
        clientName: {
            type: String,
            required: true,
            trim: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        shootType: {
            type: String,
            required: true,
            trim: true,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        amountPaying: {
            type: Number,
            default: 0,
            min: 0,
        },
        currency: {
            type: String,
            trim: true,
            default: "GHS",
        },
        status: {
            type: String,
            enum: INCOME_STATUSES,
            required: true,
            index: true,
        },
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null,
            index: true,
        },
        date: {
            type: Date,
            required: true,
            index: true,
        },
    },
    { timestamps: true }
)

incomeSchema.index({ owner: 1, date: -1 })
incomeSchema.index({ owner: 1, status: 1, date: -1 })
incomeSchema.index({ owner: 1, booking: 1 }, { sparse: true })

const Income = mongoose.model("Income", incomeSchema)

export default Income
