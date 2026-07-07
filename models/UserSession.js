import mongoose from "mongoose"

const userSessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        tokenVersion: {
            type: Number,
            default: 0,
            min: 0,
        },
        authMethod: {
            type: String,
            enum: ["email", "google", "register", "password_reset"],
            default: "email",
        },
        ipAddress: {
            type: String,
            trim: true,
            default: "",
        },
        userAgent: {
            type: String,
            trim: true,
            default: "",
        },
        loggedInAt: {
            type: Date,
            required: true,
            index: true,
        },
        lastSeenAt: {
            type: Date,
            required: true,
        },
        loggedOutAt: {
            type: Date,
            default: null,
            index: true,
        },
        logoutReason: {
            type: String,
            enum: ["logout", "expired", "revoked", null],
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: true,
        },
    },
    { timestamps: true }
)

userSessionSchema.index({ user: 1, loggedInAt: -1 })
userSessionSchema.index({ user: 1, loggedOutAt: 1, expiresAt: 1 })

const UserSession = mongoose.model("UserSession", userSessionSchema)

export default UserSession
