import mongoose from "mongoose"
import { feedbackMessageSchemaOptions } from "../utils/feedbackThread.js"

const TRASH_RESTORE_DAYS = 30

const feedbackMessageSchema = new mongoose.Schema(feedbackMessageSchemaOptions, {
    timestamps: { createdAt: true, updatedAt: false },
})

const galleryPhotoSchema = new mongoose.Schema(
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
        originalFilename: {
            type: String,
            required: true,
            trim: true,
        },
        storedFilename: {
            type: String,
            required: true,
        },
        /** Smaller grid thumbnail (`*-thumb.jpg`). */
        thumbStoredFilename: {
            type: String,
            default: null,
        },
        /** Watermarked client preview (`*-preview-wm.jpg`). */
        previewWmStoredFilename: {
            type: String,
            default: null,
        },
        url: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
        },
        sizeBytes: {
            type: Number,
            required: true,
        },
        isVideo: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
            index: true,
        },
        /** Soft-delete restore deadline (deletedAt + 30 days). */
        restoreDeadline: {
            type: Date,
            default: null,
        },
        selectedByClient: {
            type: Boolean,
            default: false,
            index: true,
        },
        clientComment: {
            type: String,
            trim: true,
            default: "",
        },
        /** Photographer response to a client selection comment. */
        photographerReply: {
            type: String,
            trim: true,
            default: "",
        },
        photographerRepliedAt: {
            type: Date,
            default: null,
        },
        /** Client ↔ photographer comment thread on a selection. */
        feedbackThread: {
            type: [feedbackMessageSchema],
            default: [],
        },
        selectedAt: {
            type: Date,
            default: null,
        },
        rejectedByClient: {
            type: Boolean,
            default: false,
            index: true,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
        rejectionComment: {
            type: String,
            trim: true,
            default: "",
        },
        /** Optional grouping within a gallery (e.g. ceremony, reception). */
        set: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GallerySet",
            default: null,
            index: true,
        },
        /** Display order within the gallery grid (lower = earlier). */
        sortOrder: {
            type: Number,
            default: 0,
            index: true,
        },
    },
    { timestamps: true }
)

galleryPhotoSchema.index({ gallery: 1, deletedAt: 1, createdAt: 1 })
galleryPhotoSchema.index({ gallery: 1, deletedAt: 1, sortOrder: 1, createdAt: 1 })
galleryPhotoSchema.index({ gallery: 1, selectedByClient: 1 })

export const GALLERY_PHOTO_TRASH_RESTORE_DAYS = TRASH_RESTORE_DAYS

const GalleryPhoto = mongoose.model("GalleryPhoto", galleryPhotoSchema)

export default GalleryPhoto
