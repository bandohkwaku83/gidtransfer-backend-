import mongoose from "mongoose"
import {
    DEFAULT_BACKDROP_COLOR,
    DEFAULT_BODY_FONT,
    DEFAULT_COVER_STYLE,
    DEFAULT_GRID_STYLE,
    DEFAULT_TITLE_FONT,
    normalizeCoverStyle,
    normalizeGeneralColor,
    normalizeGridStyle,
} from "../utils/galleryDesignFields.js"

export const GALLERY_STATUSES = ["draft", "selecting", "done"]

export const SHARE_EXPIRY_ALLOWED_DAYS = [1, 7, 14, 30, 60, 90, 365]

const gallerySchema = new mongoose.Schema(
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
        /** Event / gallery title (required in UI). */
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 300,
        },
        /** URL segment unique per owner; used in client share link. */
        slug: {
            type: String,
            trim: true,
            maxlength: 100,
        },
        eventDate: {
            type: Date,
            required: true,
            index: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        /** Shoot/event category id (same ids as booking shoot types), e.g. `wedding`. */
        galleryType: {
            type: String,
            trim: true,
            default: null,
            index: true,
        },
        status: {
            type: String,
            enum: GALLERY_STATUSES,
            default: "draft",
            index: true,
        },
        /**
         * When a share link is created/rotated, `shareExpiresAt` is set to
         * now + shareLinkExpiryDays. `null` means the link never expires.
         */
        shareLinkExpiryDays: {
            type: Number,
            default: 30,
            validate: {
                validator(v) {
                    return (
                        v === null ||
                        v === undefined ||
                        (Number.isInteger(v) && v >= 1 && v <= 3650)
                    )
                },
                message:
                    "shareLinkExpiryDays must be null (never expire) or an integer days value",
            },
        },
        /** Studio default vs custom uploaded cover (cover file remains optional). */
        useDefaultCover: {
            type: Boolean,
            default: true,
        },
        coverImageUrl: {
            type: String,
            default: null,
        },
        /** Focal point for cover crop (percentages 0–100). */
        coverFocalX: {
            type: Number,
            default: 50,
            min: 0,
            max: 100,
        },
        coverFocalY: {
            type: Number,
            default: 50,
            min: 0,
            max: 100,
        },
        /**
         * Cover snapshot for the client share gallery. Initialized when the share
         * link is activated and refreshed when the admin cover changes.
         */
        shareUseDefaultCover: {
            type: Boolean,
            default: null,
        },
        shareCoverImageUrl: {
            type: String,
            default: null,
        },
        shareCoverFocalX: {
            type: Number,
            default: null,
            min: 0,
            max: 100,
        },
        shareCoverFocalY: {
            type: Number,
            default: null,
            min: 0,
            max: 100,
        },
        /** Design snapshot: cover title text color at share-link activation. */
        shareCoverTextColor: {
            type: String,
            trim: true,
            default: null,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeGeneralColor(v)?.error
                },
                message: "shareCoverTextColor must be a preset key or hex color",
            },
        },
        /** Design snapshot: cover button color at share-link activation. */
        shareCoverButtonColor: {
            type: String,
            trim: true,
            default: null,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeGeneralColor(v)?.error
                },
                message: "shareCoverButtonColor must be a preset key or hex color",
            },
        },
        backgroundMusicUrl: {
            type: String,
            default: null,
        },
        backgroundMusicEnabled: {
            type: Boolean,
            default: false,
        },
        /** Hero layout on the client share gallery. */
        coverStyle: {
            type: String,
            default: DEFAULT_COVER_STYLE,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeCoverStyle(v)?.error
                },
                message: "coverStyle must be a supported gallery cover style",
            },
        },
        /** Preset key or custom hex (#rrggbb) for general gallery colors. */
        backdropColor: {
            type: String,
            trim: true,
            default: DEFAULT_BACKDROP_COLOR,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeGeneralColor(v)?.error
                },
                message: "generalColor must be a preset key or hex color",
            },
        },
        /** Cover hero title text color; null = client auto-contrast from backdrop. */
        coverTextColor: {
            type: String,
            trim: true,
            default: null,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeGeneralColor(v)?.error
                },
                message: "coverTextColor must be a preset key or hex color",
            },
        },
        /** Cover hero button text/border color; null = client auto-contrast from backdrop. */
        coverButtonColor: {
            type: String,
            trim: true,
            default: null,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeGeneralColor(v)?.error
                },
                message: "coverButtonColor must be a preset key or hex color",
            },
        },
        /** Default photo grid layout on the client link. */
        gridStyle: {
            type: String,
            default: DEFAULT_GRID_STYLE,
            validate: {
                validator(v) {
                    if (!v) return true
                    return !normalizeGridStyle(v)?.error
                },
                message: "gridStyle must be a supported gallery grid style",
            },
        },
        titleFont: {
            type: String,
            trim: true,
            default: DEFAULT_TITLE_FONT,
            maxlength: 120,
        },
        bodyFont: {
            type: String,
            trim: true,
            default: DEFAULT_BODY_FONT,
            maxlength: 120,
        },
        /** When true, clients must unlock the gallery with a password. */
        passwordProtected: {
            type: Boolean,
            default: false,
        },
        /** Bcrypt hash; never returned in API responses. */
        clientPasswordHash: {
            type: String,
            select: false,
            default: null,
        },
        /** When false, clients cannot download delivered finals. */
        allowDownloads: {
            type: Boolean,
            default: true,
        },
        /** When true, clients must submit an email before viewing gallery content. */
        emailGateEnabled: {
            type: Boolean,
            default: false,
        },
        /** Blank / null = unlimited client heart-picks. */
        maxSelections: {
            type: Number,
            default: null,
            validate: {
                validator(v) {
                    return (
                        v === null ||
                        v === undefined ||
                        (Number.isInteger(v) && v >= 1)
                    )
                },
                message: "maxSelections must be null (unlimited) or a positive integer",
            },
        },
        selectionSubmittedAt: {
            type: Date,
            default: null,
        },
        /** When true, clients cannot change selections or comments on originals. */
        selectionLocked: {
            type: Boolean,
            default: false,
        },
        /** When false, the Finals tab is hidden from the client gallery. */
        finalDeliveryEnabled: {
            type: Boolean,
            default: true,
        },
        /**
         * Per-gallery toggle: text watermark on client-facing raw upload previews.
         * Defaults from studio gallery-defaults when the gallery is created.
         */
        watermarkPreviewEnabled: {
            type: Boolean,
            default: false,
        },
        /**
         * Per-gallery toggle: brand logo watermark on uploaded finals.
         * Defaults from studio watermark settings when the gallery is created.
         */
        watermarkFinalsEnabled: {
            type: Boolean,
            default: false,
        },
        /** Client gallery "All" pill label (virtual set spanning every upload). */
        setsAllLabel: {
            type: String,
            trim: true,
            default: "All",
            maxlength: 80,
        },
        /** Sort index shared with named sets (0 = first pill). */
        setsAllSortOrder: {
            type: Number,
            default: 0,
        },
        /** Opaque token for shared links; omit field until activated; unshared via $unset. */
        shareToken: {
            type: String,
        },
        shareExpiresAt: {
            type: Date,
            default: null,
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
    },
    { timestamps: true }
)

gallerySchema.pre("save", function normalizeGalleryDesignFields() {
    if (this.coverStyle) {
        const parsed = normalizeCoverStyle(this.coverStyle)
        if (parsed?.value) this.coverStyle = parsed.value
    }
    if (this.gridStyle) {
        const parsed = normalizeGridStyle(this.gridStyle)
        if (parsed?.value) this.gridStyle = parsed.value
    }
    if (this.backdropColor) {
        const parsed = normalizeGeneralColor(this.backdropColor)
        if (parsed?.value) this.backdropColor = parsed.value
    }
    if (this.coverTextColor) {
        const parsed = normalizeGeneralColor(this.coverTextColor)
        if (parsed?.value) this.coverTextColor = parsed.value
    }
    if (this.coverButtonColor) {
        const parsed = normalizeGeneralColor(this.coverButtonColor)
        if (parsed?.value) this.coverButtonColor = parsed.value
    }
    if (this.shareCoverTextColor) {
        const parsed = normalizeGeneralColor(this.shareCoverTextColor)
        if (parsed?.value) this.shareCoverTextColor = parsed.value
    }
    if (this.shareCoverButtonColor) {
        const parsed = normalizeGeneralColor(this.shareCoverButtonColor)
        if (parsed?.value) this.shareCoverButtonColor = parsed.value
    }
})

gallerySchema.index({ owner: 1, deletedAt: 1, createdAt: -1 })
gallerySchema.index({ owner: 1, status: 1, deletedAt: 1 })
gallerySchema.index(
    { owner: 1, slug: 1 },
    {
        unique: true,
        name: "gallery_owner_slug_unique",
        partialFilterExpression: {
            slug: { $type: "string", $gt: "" },
            deletedAt: null,
        },
    }
)

/** Multiple galleries may omit `shareToken`; only non-empty strings must be unique. */
gallerySchema.index(
    { shareToken: 1 },
    {
        unique: true,
        name: "gallery_share_token_nonempty_unique",
        partialFilterExpression: { shareToken: { $type: "string", $gt: "" } },
    }
)
const Gallery = mongoose.model("Gallery", gallerySchema)

export default Gallery
