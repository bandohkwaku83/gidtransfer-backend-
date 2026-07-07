import dotenv from "dotenv"
import mongoose from "mongoose"
import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GallerySet from "../models/GallerySet.js"
import GalleryAnalyticsEvent from "../models/GalleryAnalyticsEvent.js"
import User from "../models/User.js"
import Client from "../models/Client.js"
import Booking from "../models/Booking.js"
import Counter from "../models/Counter.js"
import Admin from "../models/Admin.js"
import IssueReport from "../models/IssueReport.js"
import AdminCommunication from "../models/AdminCommunication.js"
import UserSession from "../models/UserSession.js"

dotenv.config()

const EXPECTED = {
    users: User,
    clients: Client,
    galleries: Gallery,
    galleryphotos: GalleryPhoto,
    galleryfinals: GalleryFinal,
    gallerysets: GallerySet,
    galleryanalyticsevents: GalleryAnalyticsEvent,
    bookings: Booking,
    counters: Counter,
    admins: Admin,
    issuereports: IssueReport,
    usersessions: UserSession,
    admincommunications: AdminCommunication,
}

async function main() {
    const url = process.env.MONGO_URL
    if (!url) {
        console.error("MONGO_URL not set")
        process.exit(1)
    }

    await mongoose.connect(url)
    const db = mongoose.connection.db

    console.log("=== Database:", db.databaseName, "===\n")

    const collections = (await db.listCollections().toArray())
        .map((c) => c.name)
        .sort()

    console.log("Collections in DB (" + collections.length + "):")
    for (const name of collections) {
        const count = await db.collection(name).countDocuments()
        const expected = EXPECTED[name] ? " [expected model]" : " [UNEXPECTED / legacy?]"
        console.log(`  ${name}: ${count} docs${expected}`)
    }

    const missing = Object.keys(EXPECTED).filter((n) => !collections.includes(n))
    if (missing.length) {
        console.log("\nExpected collections with 0 docs (not created yet):")
        for (const name of missing) console.log(`  ${name}`)
    }

    console.log("\n=== Trash (soft-delete via deletedAt) ===")
    const [trashGalleries, trashPhotos, trashFinals] = await Promise.all([
        Gallery.countDocuments({ deletedAt: { $ne: null } }),
        GalleryPhoto.countDocuments({ deletedAt: { $ne: null } }),
        GalleryFinal.countDocuments({ deletedAt: { $ne: null } }),
    ])
    console.log(`  Trashed galleries: ${trashGalleries}`)
    console.log(`  Trashed photos: ${trashPhotos}`)
    console.log(`  Trashed finals: ${trashFinals}`)
    console.log("  (No separate 'trash' collection — trash is a query filter)")

    console.log("\n=== Storage (computed from sizeBytes) ===")
    const [activeGalleries, photoBytes, finalBytes] = await Promise.all([
        Gallery.countDocuments({ deletedAt: null }),
        GalleryPhoto.aggregate([
            { $match: { deletedAt: null } },
            { $group: { _id: null, total: { $sum: "$sizeBytes" } } },
        ]),
        GalleryFinal.aggregate([
            { $match: { deletedAt: null } },
            { $group: { _id: null, total: { $sum: "$sizeBytes" } } },
        ]),
    ])
    const pBytes = photoBytes[0]?.total ?? 0
    const fBytes = finalBytes[0]?.total ?? 0
    console.log(`  Active galleries: ${activeGalleries}`)
    console.log(`  Photo bytes (non-deleted): ${pBytes}`)
    console.log(`  Final bytes (non-deleted): ${fBytes}`)
    console.log(`  Total: ${pBytes + fBytes}`)
    console.log("  (No separate 'storage' collection — storage is an API aggregation)")

    console.log("\n=== Schema field spot-checks ===")
    const checks = [
        {
            label: "galleries missing deletedAt field",
            model: Gallery,
            filter: { deletedAt: { $exists: false } },
        },
        {
            label: "galleries missing restoreDeadline field",
            model: Gallery,
            filter: { restoreDeadline: { $exists: false } },
        },
        {
            label: "photos missing deletedAt field",
            model: GalleryPhoto,
            filter: { deletedAt: { $exists: false } },
        },
        {
            label: "photos missing sortOrder field",
            model: GalleryPhoto,
            filter: { sortOrder: { $exists: false } },
        },
        {
            label: "finals missing deletedAt field",
            model: GalleryFinal,
            filter: { deletedAt: { $exists: false } },
        },
        {
            label: "users missing accountId field",
            model: User,
            filter: { accountId: { $exists: false } },
        },
    ]

    for (const { label, model, filter } of checks) {
        const n = await model.countDocuments(filter)
        console.log(`  ${label}: ${n}`)
    }

    console.log("\n=== Index sync diff (Gallery only) ===")
    try {
        const diff = await Gallery.diffIndexes()
        console.log("  toDrop:", diff.toDrop.length ? diff.toDrop : "(none)")
        console.log("  toCreate:", diff.toCreate.length ? diff.toCreate.map((i) => i[0]?.name ?? i) : "(none)")
    } catch (e) {
        console.log("  diffIndexes failed:", e.message)
    }

    await mongoose.disconnect()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
