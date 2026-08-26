import mongoose from "mongoose"
import {
    STUDIO_ROLE_KEYS,
    ALL_ASSIGNABLE_MENU_KEYS,
} from "../utils/studioMenus.js"

export const MEMBERSHIP_STATUSES = ["active", "disabled"]

const studioMembershipSchema = new mongoose.Schema(
    {
        /** Premium studio owner — all studio data is attributed to this user. */
        studioOwner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        /** Staff login account (created by the owner). */
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 320,
        },
        displayName: {
            type: String,
            trim: true,
            default: "",
            maxlength: 120,
        },
        role: {
            type: String,
            enum: STUDIO_ROLE_KEYS,
            default: "editor",
        },
        menuKeys: {
            type: [String],
            default: [],
            validate: {
                validator(keys) {
                    if (!Array.isArray(keys)) return false
                    return keys.every((k) => ALL_ASSIGNABLE_MENU_KEYS.includes(k))
                },
                message: "Invalid menu key",
            },
        },
        status: {
            type: String,
            enum: MEMBERSHIP_STATUSES,
            default: "active",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        disabledAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
)

studioMembershipSchema.index({ studioOwner: 1, user: 1 }, { unique: true })
studioMembershipSchema.index(
    { user: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
    }
)
studioMembershipSchema.index({ studioOwner: 1, status: 1 })

const StudioMembership = mongoose.model("StudioMembership", studioMembershipSchema)

export default StudioMembership
