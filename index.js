import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import express from "express"
import compression from "compression"
import mongoose from "mongoose"
import dotenv from "dotenv"
import authRoutes from "./routes/authRoutes.js"
import clientRoutes from "./routes/clientRoutes.js"
import bookingRoutes from "./routes/bookingRoutes.js"
import incomeRoutes from "./routes/incomeRoutes.js"
import dashboardRoutes from "./routes/dashboardRoutes.js"
import storageRoutes from "./routes/storageRoutes.js"
import galleryRoutes from "./routes/galleryRoutes.js"
import publicGalleryRoutes from "./routes/publicGalleryRoutes.js"
import onboardingRoutes from "./routes/onboardingRoutes.js"
import settingsRoutes from "./routes/settingsRoutes.js"
import smsRoutes from "./routes/smsRoutes.js"
import emailRoutes from "./routes/emailRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import trashRoutes from "./routes/trashRoutes.js"
import billingRoutes from "./routes/billingRoutes.js"
import syncRoutes from "./routes/syncRoutes.js"
import eventsRoutes from "./routes/eventsRoutes.js"
import { paystackWebhook } from "./controllers/billingController.js"
import Gallery from "./models/Gallery.js"
import { initAccountIdCounter, migrateMissingAccountIds } from "./utils/accountId.js"
import { migrateGalleryShareTokens } from "./utils/galleryMigrations.js"
import { backfillGalleryMediaSortOrders } from "./utils/galleryMediaOrder.js"
import { purgeExpiredTrash } from "./utils/galleryTrash.js"
import { purgeOrphanedGalleryChildren } from "./utils/galleryOrphanCleanup.js"
import { migrateLegacyEmailVerifiedUsers } from "./utils/emailVerificationMigration.js"
import { mongoUrlFromEnv } from "./utils/mongoUrlFromEnv.js"
import { mongoConnectOptions } from "./utils/mongoConnectOptions.js"
import { buildCorsMiddleware } from "./utils/corsMiddleware.js"
import { requestTiming } from "./middleware/requestTiming.js"
import { openAiConfigured } from "./utils/galleryAiDescription.js"
import { arkeselConfigured } from "./services/arkeselSms.js"
import { resendConfigured } from "./services/resendEmail.js"
import { paystackConfigured } from "./services/paystack.js"
import { s3Configured, s3PublicReadsViaDirectUrl } from "./utils/s3Storage.js"
import { createS3UploadsMiddleware } from "./utils/s3UploadsMiddleware.js"
import { startBookingReminderScheduler } from "./jobs/bookingReminderJob.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, "uploads")
const imageDir = path.join(__dirname, "image")

/** Prefer `.env` next to `index.js` (fixes missing keys when cwd is not the backend folder). */
const envCandidates = [
    path.join(__dirname, ".env"),
    path.join(process.cwd(), ".env"),
]
const existingEnvPath = envCandidates.find((p) => fs.existsSync(p))
const envPath = existingEnvPath ?? envCandidates[0]
const envLoaded = existingEnvPath
    ? dotenv.config({ path: envPath, override: true })
    : { parsed: null, error: null }

if (!process.env.JWT_SECRET?.trim()) {
    console.error("JWT_SECRET is not set in .env")
    process.exit(1)
}

if (openAiConfigured()) {
    console.log("Gallery AI: enabled (API key detected)")
} else {
    console.warn(
        "Gallery AI: disabled — no API key loaded. Use env name OPENAI_API_KEY in .env, then restart."
    )
}

if (arkeselConfigured()) {
    console.log("SMS (Arkesel): enabled (API key detected)")
} else {
    console.warn(
        "SMS (Arkesel): disabled — set ARKESEL_API_KEY and ARKESEL_DEFAULT_SENDER in .env to send SMS."
    )
}

if (resendConfigured()) {
    console.log("Email (Resend): enabled (API key detected)")
} else {
    console.warn(
        "Email (Resend): disabled — set RESEND_API_KEY and RESEND_FROM_EMAIL in .env to send email."
    )
}

if (paystackConfigured()) {
    console.log("Billing (Paystack): enabled (secret key detected)")
} else {
    console.warn(
        "Billing (Paystack): disabled — set PAYSTACK_SECRET_KEY and plan codes in .env for subscriptions."
    )
}

if (s3Configured()) {
    const bucket = process.env.S3_BUCKET?.trim()
    if (s3PublicReadsViaDirectUrl()) {
        console.log(
            `Object storage (S3): enabled — bucket ${bucket}, public reads via ${process.env.S3_PUBLIC_URL?.trim()}`
        )
    } else {
        console.log(
            `Object storage (S3): enabled — bucket ${bucket}, gallery media served via GET /uploads/… (set S3_PUBLIC_URL for a CDN)`
        )
    }
} else {
    console.warn(
        "Object storage (S3): disabled — gallery uploads use local disk. Set S3_BUCKET, AWS_REGION, and AWS credentials for direct-to-S3 uploads."
    )
}

const app = express()

if (
    process.env.TRUST_PROXY === "1" ||
    process.env.TRUST_PROXY === "true"
) {
    app.set("trust proxy", true)
}

app.use(requestTiming)
app.use(
    compression({
        threshold: Number(process.env.COMPRESSION_THRESHOLD_BYTES ?? 1024),
        filter: (req, res) => {
            if (req.headers["x-no-compression"]) return false
            return compression.filter(req, res)
        },
    })
)
app.use(buildCorsMiddleware())
app.post(
    "/api/billing/webhook",
    express.raw({ type: "application/json" }),
    paystackWebhook
)
app.use(express.json({ limit: "2mb" }))
fs.mkdirSync(path.join(uploadsDir, "studio-logos"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "brand"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "user-avatars"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "watermark-logos"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "gallery-default-covers"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "issue-reports"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "gallery-covers"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "gallery-photos"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "gallery-music"), { recursive: true })
fs.mkdirSync(path.join(uploadsDir, "gallery-finals"), { recursive: true })
fs.mkdirSync(imageDir, { recursive: true })
app.use("/image", express.static(imageDir))
app.use("/uploads", createS3UploadsMiddleware({ uploadsDir }), express.static(uploadsDir))

app.get("/", (_req, res) => {
    res.json({ message: "Photo Global Admin API is running" })
})

app.get("/health", (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1
    const pool = mongoose.connection.client?.topology?.s?.pool
    res.json({
        ok: true,
        service: "photo_global_admin",
        mongodb: dbConnected ? "connected" : "disconnected",
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
            rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        },
        ...(pool
            ? {
                  mongoPool: {
                      totalConnections: pool.totalConnectionCount,
                      availableConnections: pool.availableConnectionCount,
                  },
              }
            : {}),
    })
})

app.get("/api", (_req, res) => {
    res.json({
        service: "photo_global_admin",
        endpoints: {
            health: "/health",
            register: "POST /api/auth/register",
            google: "POST /api/auth/google",
            login: "POST /api/auth/login",
            forgotPassword: "POST /api/auth/forgot-password",
            resetPassword: "POST /api/auth/reset-password",
            verifyEmail: "POST /api/auth/verify-email (JSON: code)",
            resendVerification: "POST /api/auth/resend-verification",
            me: "GET /api/auth/me",
            logout: "POST /api/auth/logout",
            signout: "POST /api/auth/signout",
            onboarding: {
                get: "GET /api/onboarding",
                complete:
                    "POST /api/onboarding (multipart: companyName, companySlug, phone, primaryDeliverable, country, smsSenderId; optional referralCode, logo)",
                update: "PUT /api/onboarding",
            },
            sms: {
                config: "GET /api/sms/config",
                test: "POST /api/sms/test (JSON: phone, optional message)",
            },
            email: {
                config: "GET /api/email/config",
                test: "POST /api/email/test (JSON: optional to)",
            },
            admin: {
                login: "POST /api/admin/auth/login",
                me: "GET /api/admin/auth/me",
                listSenderIds:
                    "GET /api/admin/sms/sender-ids?status=pending|approved|rejected|all",
                approveSenderId:
                    "PATCH /api/admin/sms/sender-ids/:userId/approve",
                rejectSenderId:
                    "PATCH /api/admin/sms/sender-ids/:userId/reject (JSON: reason)",
                emailLogo: {
                    get: "GET /api/admin/email/logo",
                    upload:
                        "POST /api/admin/email/logo (multipart field: logo — PNG/JPG)",
                    delete: "DELETE /api/admin/email/logo",
                },
            },
            settings: {
                get: "GET /api/settings",
                update:
                    "PUT /api/settings (multipart: businessName, companySlug, phone, website; optional logo, avatar, emailNotifications, clearLogo, clearAvatar)",
                profile: "GET /api/settings/profile",
                overview: "GET /api/settings/overview",
                studio: "GET /api/settings/studio",
                account: "GET /api/settings/account",
                watermark: {
                    get: "GET /api/settings/watermark",
                    update:
                        "PUT /api/settings/watermark (multipart: enabled, trim, portrait, landscape; optional logo, clearLogo)",
                },
                galleryDefaults: {
                    get: "GET /api/settings/gallery-defaults",
                    update:
                        "PUT /api/settings/gallery-defaults (multipart: watermarkPreviewEnabled; cover or defaultCover file; clearCover)",
                    patchWatermarkPreview:
                        "PATCH /api/settings/gallery-defaults/watermark-preview (JSON: watermarkPreviewEnabled or enabled)",
                    uploadDefaultCover:
                        "PUT|POST /api/settings/gallery-defaults/default-cover (multipart: cover or defaultCover)",
                    removeDefaultCover:
                        "DELETE /api/settings/gallery-defaults/default-cover",
                },
                reportIssue: {
                    form: "GET /api/settings/report-issue",
                    submit:
                        "POST /api/settings/report-issue (multipart: topic, description; optional attachments)",
                    helpSupport: "GET|POST /api/settings/help-support (alias)",
                },
            },
            dashboard: "GET /api/dashboard",
            sync: {
                revision: "GET /api/sync/revision (lightweight cache check — ETag supported)",
                changes: "GET /api/sync/changes?since=ISO8601 (incremental updates)",
                batch: "POST /api/sync/batch (JSON: include[] — aggregate multiple resources)",
            },
            events: {
                stream: "GET /api/events/stream (SSE — real-time sync.changed events)",
            },
            storage: "GET /api/storage?sort=size|name&order=asc|desc",
            billing: {
                config: "GET /api/billing/config",
                plans: "GET /api/billing/plans",
                subscription: "GET /api/billing/subscription",
                checkout: "POST /api/billing/checkout (JSON: planId)",
                cancel: "POST /api/billing/cancel",
                verify:
                    "GET|POST /api/billing/verify?reference= (after Paystack redirect)",
                webhook: "POST /api/billing/webhook (Paystack — raw JSON body)",
            },
            bookings: {
                meta: "GET /api/bookings/meta",
                weekSummary: "GET /api/bookings/week-summary",
                stats: "GET /api/bookings/stats",
                upcoming: "GET /api/bookings/upcoming",
                list: "GET /api/bookings?year=&month=&type=&view=summary&since=&fields=&page=&limit=",
                get: "GET /api/bookings/:id",
                create: "POST /api/bookings",
                update: "PUT /api/bookings/:id",
                delete: "DELETE /api/bookings/:id",
            },
            income: {
                list: "GET /api/income?year=",
                summary: "GET /api/income/summary?year=",
                get: "GET /api/income/:id",
                create: "POST /api/income",
                update: "PUT /api/income/:id",
                delete: "DELETE /api/income/:id",
            },
            clients: {
                list: "GET /api/clients?view=summary&since=&fields=&page=&limit=",
                get: "GET /api/clients/:id",
                create: "POST /api/clients",
                update: "PUT /api/clients/:id",
                delete: "DELETE /api/clients/:id",
            },
            galleries: {
                meta: "GET /api/galleries/meta (gallery types + design options for customize form)",
                proposeDescription:
                    "POST /api/galleries/generate-description (preview; needs OPENAI_API_KEY)",
                list: "GET /api/galleries?status=&search=&trash=&view=summary&since=&fields=&page=&limit=",
                get: "GET /api/galleries/:id",
                detail: "GET /api/galleries/:id/detail",
                analytics: "GET /api/galleries/:id/analytics",
                complete: "PATCH /api/galleries/:id/complete",
                coverFocalPoint: "PATCH /api/galleries/:id/cover-focal-point",
                music: {
                    upload: "POST /api/galleries/:id/music (multipart field audio)",
                    remove: "DELETE /api/galleries/:id/music",
                    settings: "PATCH /api/galleries/:id/music",
                },
                selectionSettings: "PATCH /api/galleries/:id/selection-settings",
                designSettings:
                    "PATCH /api/galleries/:id/design-settings (coverStyle, generalColor, coverTextColor, coverButtonColor, gridStyle, titleFont, bodyFont)",
                clientAccess:
                    "PATCH /api/galleries/:id/client-access (passwordProtected, password, allowDownloads)",
                uploadSettings:
                    "PATCH /api/galleries/:id/upload-settings (watermarkPreviewEnabled)",
                finalSettings:
                    "PATCH /api/galleries/:id/final-settings (watermarkFinalsEnabled)",
                uploads: {
                    list: "GET /api/galleries/:id/uploads (ordered by sortOrder)",
                    reorder:
                        "PATCH /api/galleries/:id/uploads/reorder (body: photoIds[])",
                    presign:
                        "POST /api/galleries/:id/uploads/presign (JSON: files[] with originalFilename, mimeType, sizeBytes — returns presigned S3 PUT URLs)",
                    complete:
                        "POST /api/galleries/:id/uploads/complete (JSON: files[] with storedFilename from presign — registers uploads; thumbnails generated in background)",
                    upload:
                        "POST /api/galleries/:id/uploads (multipart — local dev only when S3 is not configured)",
                    bulkDelete: "POST /api/galleries/:id/uploads/bulk-delete",
                    delete: "DELETE /api/galleries/:id/uploads/:photoId",
                    restore: "POST /api/galleries/:id/uploads/:photoId/restore",
                },
                selections: "GET /api/galleries/:id/selections",
                finals: {
                    list: "GET /api/galleries/:id/finals (ordered by sortOrder)",
                    flagged: "GET /api/galleries/:id/finals/flagged",
                    reorder:
                        "PATCH /api/galleries/:id/finals/reorder (body: finalIds[])",
                    presign:
                        "POST /api/galleries/:id/finals/presign (JSON: files[] — presigned S3 PUT URLs)",
                    complete:
                        "POST /api/galleries/:id/finals/complete (JSON: files[] with storedFilename from presign)",
                    upload: "POST /api/galleries/:id/finals (multipart — local dev only when S3 is not configured)",
                    lock: "PATCH /api/galleries/:id/finals/:finalId/lock",
                    bulkDelete: "POST /api/galleries/:id/finals/bulk-delete",
                    delete: "DELETE /api/galleries/:id/finals/:finalId",
                    restore: "POST /api/galleries/:id/finals/:finalId/restore",
                },
                create: "POST /api/galleries (multipart optional field cover)",
                update:
                    "PUT /api/galleries/:id (name, eventDate, description, galleryType, slug, clientId, status, shareLinkExpiryDays, useDefaultCover; body generateDescriptionAi to refresh AI text)",
                restore: "PATCH /api/galleries/:id/restore",
                delete: "DELETE /api/galleries/:id (soft-delete / trash)",
                shareLinkActivate:
                    "POST /api/galleries/:id/share-link (optional JSON: notifyClientViaSms, message)",
                shareLinkRevoke: "DELETE /api/galleries/:id/share-link",
            },
            trash: {
                list: "GET /api/trash",
                restore: "POST /api/trash/restore",
                empty: "DELETE /api/trash",
            },
            publicGalleries: {
                viewByToken: "GET /api/public/token/:shareToken",
                unlockByToken: "POST /api/public/token/:shareToken/unlock",
                view: "GET /api/public/:companySlug/:gallerySlug",
                unlock: "POST /api/public/:companySlug/:gallerySlug/unlock",
                select: "POST /api/public/:companySlug/:gallerySlug/select",
                comment: "POST /api/public/:companySlug/:gallerySlug/comment",
                flagFinal:
                    "POST /api/public/:companySlug/:gallerySlug/finals/:finalId/flag",
                updateFinalComment:
                    "PATCH /api/public/:companySlug/:gallerySlug/finals/:finalId/comment",
                submitSelections:
                    "POST /api/public/:companySlug/:gallerySlug/submit-selections",
                downloadFinal:
                    "GET /api/public/:companySlug/:gallerySlug/finals/:finalId/download",
                tokenRoutes:
                    "Same actions under /api/public/token/:shareToken/...",
            },
        },
    })
})

app.use("/api/auth", authRoutes)
app.use("/api/onboarding", onboardingRoutes)
app.use("/api/settings", settingsRoutes)
app.use("/api/sms", smsRoutes)
app.use("/api/email", emailRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/clients", clientRoutes)
app.use("/api/galleries", galleryRoutes)
app.use("/api/trash", trashRoutes)
app.use("/api/public", publicGalleryRoutes)
app.use("/api/bookings", bookingRoutes)
app.use("/api/income", incomeRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/storage", storageRoutes)
app.use("/api/billing", billingRoutes)
app.use("/api/sync", syncRoutes)
app.use("/api/events", eventsRoutes)

app.use((_req, res) => {
    res.status(404).json({
        error: "Not Found",
        service: "photo_global_admin",
    })
})

app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(500).json({ message: "Server error" })
})

const PORT = process.env.PORT || 7100
const MONGO_URL = mongoUrlFromEnv()

if (!MONGO_URL) {
    const exists = fs.existsSync(envPath)
    const bytes = exists ? fs.statSync(envPath).size : 0
    const parsedKeys = envLoaded.parsed
        ? Object.keys(envLoaded.parsed).length
        : 0
    console.error(
        "MONGO_URL is not set. Copy .env.example to .env and set MONGO_URL."
    )
    console.error(
        `  File: ${envPath} — ${exists ? `exists (${bytes} bytes)` : "missing"}; dotenv parsed ${parsedKeys} key(s).`
    )
    process.exit(1)
}

mongoose
    .connect(MONGO_URL, mongoConnectOptions())
    .then(async () => {
        console.log("Connected to MongoDB")
        try {
            await migrateGalleryShareTokens()
            await backfillGalleryMediaSortOrders()
            await initAccountIdCounter()
            await Gallery.syncIndexes()
            const { default: GalleryAccessEmail } = await import(
                "./models/GalleryAccessEmail.js"
            )
            await GalleryAccessEmail.syncIndexes()
            const { default: User } = await import("./models/User.js")
            await User.syncIndexes()
            const { default: Booking } = await import("./models/Booking.js")
            await Booking.syncIndexes()
            const accountIdsMigrated = await migrateMissingAccountIds()
            if (accountIdsMigrated > 0) {
                console.log(
                    `[accounts] Assigned account IDs to ${accountIdsMigrated} user(s)`
                )
            }
            const emailVerifiedMigrated = await migrateLegacyEmailVerifiedUsers()
            if (emailVerifiedMigrated > 0) {
                console.log(
                    `[email-verification] Marked ${emailVerifiedMigrated} legacy user(s) as verified`
                )
            }
            console.log("Gallery indexes synced")
        } catch (err) {
            console.error(
                "Gallery.syncIndexes failed (you may fix indexes manually):",
                err.message
            )
        }

        try {
            const orphanResult = await purgeOrphanedGalleryChildren()
            const orphanTotal =
                orphanResult.photos +
                orphanResult.finals +
                orphanResult.sets +
                orphanResult.analyticsEvents
            if (orphanTotal > 0 || orphanResult.orphanPhotoDirs > 0 || orphanResult.orphanFinalDirs > 0) {
                console.log(
                    `[db] Purged orphaned gallery data: ${orphanResult.photos} photos, ${orphanResult.finals} finals, ${orphanResult.sets} sets, ${orphanResult.analyticsEvents} analytics events; removed ${orphanResult.orphanPhotoDirs} photo dir(s), ${orphanResult.orphanFinalDirs} final dir(s)`
                )
            }
        } catch (err) {
            console.error("[db] Orphan cleanup failed:", err.message)
        }

        const runTrashPurge = async () => {
            try {
                const result = await purgeExpiredTrash()
                const total = result.galleries + result.photos + result.finals
                if (total > 0) {
                    console.log(
                        `[trash] Purged expired items: ${result.galleries} galleries, ${result.photos} photos, ${result.finals} finals`
                    )
                }
            } catch (err) {
                console.error("[trash] Purge failed:", err.message)
            }
        }

        await runTrashPurge()
        setInterval(runTrashPurge, 60 * 60 * 1000)

        startBookingReminderScheduler()

        app.listen(PORT, () => {
            console.log(`Photo Global Admin API listening on port ${PORT}`)
        })
    })
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
