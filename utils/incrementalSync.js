export const parseSinceQuery = (query) => {
    const raw =
        query?.since ??
        query?.updatedSince ??
        query?.updated_since ??
        query?.after
    if (raw == null || raw === "") return null

    const parsed = new Date(String(raw))
    if (Number.isNaN(parsed.getTime())) {
        return { error: "Invalid since timestamp (use ISO 8601)" }
    }
    return { since: parsed }
}

export const buildUpdatedSinceFilter = (since) => ({
    updatedAt: { $gt: since },
})

export const buildChangedSinceFilter = (since) => ({
    $or: [{ updatedAt: { $gt: since } }, { deletedAt: { $gt: since } }],
})
