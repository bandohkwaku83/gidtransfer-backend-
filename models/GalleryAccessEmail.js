import mongoose from "mongoose"

const galleryAccessEmailSchema = new mongoose.Schema(
    {
        gallery: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Gallery",
            required: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 320,
        },
        accessedAt: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
        ipAddress: {
            type: String,
            trim: true,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
    },
    { timestamps: false }
)

galleryAccessEmailSchema.index({ gallery: 1, accessedAt: -1 })

const GalleryAccessEmail = mongoose.model(
    "GalleryAccessEmail",
    galleryAccessEmailSchema
)

export default GalleryAccessEmail
