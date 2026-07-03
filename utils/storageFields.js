/** Default free-tier storage cap (5 GiB). */
export const FREE_PLAN_LIMIT_BYTES = 5 * 1024 * 1024 * 1024

export const DEFAULT_PLAN_NAME = "Free"

export const formatBytesLabel = (bytes) => {
    const gb = bytes / (1024 * 1024 * 1024)
    if (gb >= 1 && Number.isInteger(gb)) return `${gb} GB`
    if (gb >= 1) return `${Math.round(gb * 10) / 10} GB`
    const mb = bytes / (1024 * 1024)
    if (mb >= 1) return `${Math.round(mb)} MB`
    return `${bytes} B`
}

import { getPlanById, getUserPlanId } from "./planCatalog.js"

export const getPlanSummary = (user) => {
    const planId = user ? getUserPlanId(user) : "free"
    const plan = getPlanById(planId) ?? getPlanById("free")

    return {
        planId: plan.id,
        planName: plan.name,
        planLabel: `${plan.name} plan`,
        storageLimitBytes: plan.storageLimitBytes,
        storageLabel: formatBytesLabel(plan.storageLimitBytes),
    }
}

export const parseStorageSort = (query = {}) => {
    const raw = String(query.sort ?? query.orderBy ?? "size")
        .trim()
        .toLowerCase()

    const by = raw === "name" ? "name" : "size"

    const orderRaw = String(query.order ?? query.direction ?? "")
        .trim()
        .toLowerCase()

    let order = orderRaw === "asc" || orderRaw === "desc" ? orderRaw : null
    if (!order) {
        order = by === "name" ? "asc" : "desc"
    }

    return { by, order }
}

export const sortStorageGalleries = (rows, { by, order }) => {
    const dir = order === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
        if (by === "name") {
            const cmp = a.name.localeCompare(b.name, undefined, {
                sensitivity: "base",
            })
            return cmp * dir
        }
        const diff = a.totalBytes - b.totalBytes
        if (diff !== 0) return diff * dir
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    })
}

export const sumBreakdown = (rows) =>
    rows.reduce(
        (acc, row) => {
            acc.rawsBytes += row.rawsBytes
            acc.selectionsBytes += row.selectionsBytes
            acc.finalsBytes += row.finalsBytes
            acc.totalBytes += row.totalBytes
            return acc
        },
        {
            rawsBytes: 0,
            selectionsBytes: 0,
            finalsBytes: 0,
            totalBytes: 0,
        }
    )

export const computePercentOfPlan = (usedBytes, limitBytes) => {
    if (!limitBytes || limitBytes <= 0) return 0
    const pct = (usedBytes / limitBytes) * 100
    return Math.round(pct * 100) / 100
}
