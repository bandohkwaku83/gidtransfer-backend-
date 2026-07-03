import mongoose from "mongoose"

export const GALLERY_ANALYTICS_EVENT_TYPES = ["link_view", "client_download"]

const galleryAnalyticsEventSchema = new mongoose.Schema(
    {
        gallery: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Gallery",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: GALLERY_ANALYTICS_EVENT_TYPES,
            required: true,
            index: true,
        },
        occurredAt: {
            type: Date,
            required: true,
            default: Date.now,
            index: true,
        },
        /** Optional reference for download events. */
        finalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "GalleryFinal",
            default: null,
        },
    },
    { timestamps: false }
)

galleryAnalyticsEventSchema.index({ gallery: 1, type: 1, occurredAt: -1 })

const GalleryAnalyticsEvent = mongoose.model(
    "GalleryAnalyticsEvent",
    galleryAnalyticsEventSchema
)

export default GalleryAnalyticsEvent
