import mongoose from "mongoose"
import Gallery from "../models/Gallery.js"
import Client from "../models/Client.js"
import Booking from "../models/Booking.js"
import Income from "../models/Income.js"
import { cacheDelete, cacheGetOrSet } from "./memoryCache.js"
import { galleryOwnerFilter } from "./galleryFields.js"
import { clientOwnerFilter } from "./clientFields.js"
import { bookingOwnerFilter } from "./bookingFields.js"
import { incomeOwnerFilter } from "./incomeFields.js"

const REVISION_CACHE_TTL_MS = Number(process.env.SYNC_REVISION_CACHE_TTL_MS ?? 5_000)

export const ownerRevisionCacheKey = (ownerId) => `sync:rev:${String(ownerId)}`

export const invalidateOwnerRevision = (ownerId) => {
    cacheDelete(ownerRevisionCacheKey(ownerId))
}

const latestTimestamp = (doc) => {
    const updated = doc?.updatedAt ? new Date(doc.updatedAt).getTime() : 0
    const deleted = doc?.deletedAt ? new Date(doc.deletedAt).getTime() : 0
    return Math.max(updated, deleted)
}

export const computeOwnerRevision = async (ownerId) => {
    const ownerKey = String(ownerId)
    return cacheGetOrSet(
        ownerRevisionCacheKey(ownerKey),
        async () => {
            const ownerObjectId =
                ownerId instanceof mongoose.Types.ObjectId
                    ? ownerId
                    : new mongoose.Types.ObjectId(ownerKey)

            const [gallery, client, booking, income] = await Promise.all([
                Gallery.findOne(galleryOwnerFilter(ownerObjectId))
                    .sort({ updatedAt: -1 })
                    .select("updatedAt deletedAt")
                    .lean(),
                Client.findOne(clientOwnerFilter(ownerObjectId))
                    .sort({ updatedAt: -1 })
                    .select("updatedAt")
                    .lean(),
                Booking.findOne(bookingOwnerFilter(ownerObjectId))
                    .sort({ updatedAt: -1 })
                    .select("updatedAt")
                    .lean(),
                Income.findOne(incomeOwnerFilter(ownerObjectId))
                    .sort({ updatedAt: -1 })
                    .select("updatedAt")
                    .lean(),
            ])

            const stamp = Math.max(
                latestTimestamp(gallery),
                latestTimestamp(client),
                latestTimestamp(booking),
                latestTimestamp(income)
            )

            return `${ownerKey}-${stamp}`
        },
        REVISION_CACHE_TTL_MS
    )
}

export const publishOwnerChange = async (ownerId) => {
    invalidateOwnerRevision(ownerId)
    const { publishOwnerEvent } = await import("./realtimeHub.js")
    const revision = await computeOwnerRevision(ownerId)
    publishOwnerEvent(ownerId, "sync.changed", { revision })
    return revision
}
