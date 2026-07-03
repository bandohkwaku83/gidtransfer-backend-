import mongoose from "mongoose"

const clientSchema = new mongoose.Schema(
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
        },
        email: {
            type: String,
            lowercase: true,
            trim: true,
            default: "",
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        location: {
            type: String,
            required: true,
            trim: true,
        },
    },
    { timestamps: true }
)

clientSchema.index({ owner: 1, createdAt: -1 })
clientSchema.index({ name: "text", email: "text", phone: "text", location: "text" })

const Client = mongoose.model("Client", clientSchema)

export default Client
