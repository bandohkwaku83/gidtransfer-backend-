import mongoose from "mongoose"

const bookingSchema = new mongoose.Schema(
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
        title: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        /** Amount charged for the booking (GHS). */
        amountCharged: {
            type: Number,
            default: 0,
            min: 0,
        },
        currency: {
            type: String,
            trim: true,
            default: "GHS",
        },
        startsAt: {
            type: Date,
            required: true,
            index: true,
        },
        endsAt: {
            type: Date,
            default: null,
        },
        location: {
            type: String,
            trim: true,
            default: "",
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        /** When the 1-day-before reminder email was sent to the photographer. */
        dayReminderEmailSentAt: {
            type: Date,
            default: null,
            index: true,
        },
        /** When the 1-hour-before reminder email was sent to the photographer. */
        hourReminderEmailSentAt: {
            type: Date,
            default: null,
            index: true,
        },
    },
    { timestamps: true }
)

bookingSchema.index({ owner: 1, startsAt: 1 })
bookingSchema.index({ owner: 1, category: 1, startsAt: 1 })

const Booking = mongoose.model("Booking", bookingSchema)

export default Booking
