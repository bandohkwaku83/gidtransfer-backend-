import mongoose from "mongoose"
import { feedbackMessageSchemaOptions } from "../utils/feedbackThread.js"

const feedbackMessageSchema = new mongoose.Schema(feedbackMessageSchemaOptions, {
    timestamps: { createdAt: true, updatedAt: false },
})

const galleryFinalSchema = new mongoose.Schema(
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
        /** Payment gate — client sees preview only when locked. */
        isLocked: {
            type: Boolean,
            default: false,
        },
        outstandingBalanceGhs: {
            type: Number,
            default: null,
        },
        clientPaid: {
            type: Boolean,
            default: true,
        },
        /** Client feedback on this delivered edit. */
        clientComment: {
            type: String,
            default: "",
            trim: true,
        },
        /** Photographer response to client final feedback. */
        photographerReply: {
            type: String,
            default: "",
            trim: true,
        },
        photographerRepliedAt: {
            type: Date,
            default: null,
        },
        /** Client ↔ photographer comment thread on a flagged final. */
        feedbackThread: {
            type: [feedbackMessageSchema],
            default: [],
        },
        /** Client flagged this final for photographer review (one-way; not a toggle). */
        flaggedByClient: {
            type: Boolean,
            default: false,
            index: true,
        },
        flaggedAt: {
            type: Date,
            default: null,
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

galleryFinalSchema.index({ gallery: 1, deletedAt: 1, createdAt: 1 })
galleryFinalSchema.index({ gallery: 1, deletedAt: 1, sortOrder: 1, createdAt: 1 })

const GalleryFinal = mongoose.model("GalleryFinal", galleryFinalSchema)

export default GalleryFinal
