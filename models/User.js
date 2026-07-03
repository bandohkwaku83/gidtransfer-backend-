import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const studioSchema = new mongoose.Schema(
    {
        companyName: {
            type: String,
            trim: true,
            default: "",
        },
        /** URL slug for tenant subdomain, e.g. bizzles → http://bizzles.localhost:3000 */
        companySlug: {
            type: String,
            trim: true,
            default: "",
            index: true,
        },
        phone: {
            type: String,
            trim: true,
            default: "",
        },
        /** e.g. photos, videos, photos_videos */
        primaryDeliverable: {
            type: String,
            trim: true,
            default: "",
        },
        country: {
            type: String,
            trim: true,
            default: "",
        },
        referralCode: {
            type: String,
            trim: true,
            default: "",
        },
        logoDataUrl: {
            type: String,
            default: "",
        },
        logoUrl: {
            type: String,
            default: "",
        },
        website: {
            type: String,
            trim: true,
            default: "",
        },
        /** Arkesel sender ID shown on outbound SMS (max 11 alphanumeric). */
        smsSenderId: {
            type: String,
            trim: true,
            default: "",
            uppercase: true,
        },
        smsSenderStatus: {
            type: String,
            enum: ["none", "pending", "approved", "rejected"],
            default: "none",
        },
        smsSenderRequestedAt: {
            type: Date,
        },
        smsSenderApprovedAt: {
            type: Date,
        },
        smsSenderRejectedReason: {
            type: String,
            trim: true,
            default: "",
        },
    },
    { _id: false }
)

const watermarkTrimSchema = new mongoose.Schema(
    {
        /** Normalized crop box within the source logo (0–1). */
        x: { type: Number, default: 0, min: 0, max: 1 },
        y: { type: Number, default: 0, min: 0, max: 1 },
        width: { type: Number, default: 1, min: 0, max: 1 },
        height: { type: Number, default: 1, min: 0, max: 1 },
    },
    { _id: false }
)

const watermarkPlacementSchema = new mongoose.Schema(
    {
        size: {
            type: String,
            enum: ["small", "medium", "large"],
            default: "medium",
        },
        opacity: { type: Number, default: 65, min: 0, max: 100 },
        /** Percent from left edge of the photo (0–100). */
        positionX: { type: Number, default: 85, min: 0, max: 100 },
        /** Percent from top edge of the photo (0–100). */
        positionY: { type: Number, default: 90, min: 0, max: 100 },
    },
    { _id: false }
)

const watermarkSchema = new mongoose.Schema(
    {
        /** When true, logo is burned onto client downloads. */
        enabled: { type: Boolean, default: false },
        logoDataUrl: { type: String, default: "" },
        logoUrl: { type: String, default: "" },
        trim: {
            type: watermarkTrimSchema,
            default: () => ({}),
        },
        portrait: {
            type: watermarkPlacementSchema,
            default: () => ({}),
        },
        landscape: {
            type: watermarkPlacementSchema,
            default: () => ({}),
        },
    },
    { _id: false }
)

const subscriptionSchema = new mongoose.Schema(
    {
        planId: {
            type: String,
            trim: true,
            default: "free",
        },
        status: {
            type: String,
            enum: [
                "free",
                "active",
                "pending",
                "past_due",
                "cancelled",
                "non_renewing",
            ],
            default: "free",
        },
        paystackCustomerCode: {
            type: String,
            trim: true,
            default: "",
        },
        paystackSubscriptionCode: {
            type: String,
            trim: true,
            default: "",
        },
        paystackEmailToken: {
            type: String,
            trim: true,
            default: "",
            select: false,
        },
        paystackPlanCode: {
            type: String,
            trim: true,
            default: "",
        },
        currentPeriodEnd: {
            type: Date,
            default: null,
        },
        cancelAtPeriodEnd: {
            type: Boolean,
            default: false,
        },
        /** Plan being purchased before Paystack confirms payment. */
        pendingPlanId: {
            type: String,
            trim: true,
            default: "",
        },
    },
    { _id: false }
)

const galleryDefaultsSchema = new mongoose.Schema(
    {
        /** Text watermark on client selection thumbnails. */
        watermarkPreviewEnabled: { type: Boolean, default: false },
        defaultCoverDataUrl: { type: String, default: "" },
        defaultCoverUrl: { type: String, default: "" },
    },
    { _id: false }
)

const userSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            minlength: 6,
        },
        authProvider: {
            type: String,
            enum: ["email", "google", "apple"],
            default: "email",
        },
        providerId: {
            type: String,
            trim: true,
        },
        agreedToTermsAt: {
            type: Date,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        /** Incremented on logout to invalidate outstanding JWTs. */
        tokenVersion: {
            type: Number,
            default: 0,
            min: 0,
        },
        passwordResetToken: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },
        emailVerifiedAt: {
            type: Date,
            default: null,
            index: true,
        },
        emailVerificationOtpHash: {
            type: String,
            select: false,
        },
        emailVerificationExpires: {
            type: Date,
            select: false,
        },
        emailVerificationSentAt: {
            type: Date,
            select: false,
        },
        studio: {
            type: studioSchema,
            default: () => ({}),
        },
        onboardingCompletedAt: {
            type: Date,
        },
        /** Public account reference, e.g. gt1001 */
        accountId: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
            index: true,
        },
        role: {
            type: String,
            trim: true,
            default: "Photographer",
        },
        avatarDataUrl: {
            type: String,
            default: "",
        },
        avatarUrl: {
            type: String,
            default: "",
        },
        watermark: {
            type: watermarkSchema,
            default: () => ({}),
        },
        galleryDefaults: {
            type: galleryDefaultsSchema,
            default: () => ({}),
        },
        emailNotifications: {
            enabled: { type: Boolean, default: true },
            bookingReminders: { type: Boolean, default: true },
            galleryComments: { type: Boolean, default: true },
            galleryFlags: { type: Boolean, default: true },
            gallerySelections: { type: Boolean, default: true },
        },
        subscription: {
            type: subscriptionSchema,
            default: () => ({}),
        },
    },
    { timestamps: true }
)

userSchema.pre("save", async function () {
    if (!this.isModified("password") || !this.password) return
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
})

userSchema.methods.comparePassword = function (candidatePassword) {
    if (!this.password) return Promise.resolve(false)
    return bcrypt.compare(candidatePassword, this.password)
}

userSchema.methods.toJSON = function () {
    const obj = this.toObject()
    delete obj.password
    return obj
}

userSchema.index(
    { "studio.smsSenderId": 1 },
    {
        unique: true,
        partialFilterExpression: {
            "studio.smsSenderId": { $gt: "" },
        },
    }
)

const User = mongoose.model("User", userSchema)

export default User
