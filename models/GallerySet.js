import mongoose from "mongoose"

const gallerySetSchema = new mongoose.Schema(
    {
        gallery: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Gallery",
            required: true,
            index: true,
        },
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
            maxlength: 80,
        },
        sortOrder: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
)

gallerySetSchema.index({ gallery: 1, sortOrder: 1 })

const GallerySet = mongoose.model("GallerySet", gallerySetSchema)

export default GallerySet
