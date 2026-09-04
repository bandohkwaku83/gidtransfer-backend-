const DEFAULT_TTL_MS = 60_000
const MAX_ENTRIES = 5000

const store = new Map()
/** In-flight loader promises so concurrent callers share a single fetch. */
const inflight = new Map()

const nowMs = () => Date.now()

const pruneExpired = () => {
    const now = nowMs()
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key)
    }
}

const evictIfNeeded = () => {
    if (store.size <= MAX_ENTRIES) return
    const oldestKey = store.keys().next().value
    if (oldestKey) store.delete(oldestKey)
}

export const cacheGet = (key) => {
    const entry = store.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= nowMs()) {
        store.delete(key)
        return undefined
    }
    return entry.value
}

export const cacheSet = (key, value, ttlMs = DEFAULT_TTL_MS) => {
    if (store.size >= MAX_ENTRIES && !store.has(key)) {
        pruneExpired()
        evictIfNeeded()
    }
    store.set(key, { value, expiresAt: nowMs() + ttlMs })
}

export const cacheDelete = (key) => {
    store.delete(key)
    inflight.delete(key)
}

export const cacheDeletePrefix = (prefix) => {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key)
    }
    for (const key of inflight.keys()) {
        if (key.startsWith(prefix)) inflight.delete(key)
    }
}

/**
 * Get-or-set with in-flight dedup: concurrent callers for the same key share
 * one loader invocation. Loader errors are propagated but never cached.
 */
export const cacheGetOrSet = async (key, loader, ttlMs = DEFAULT_TTL_MS) => {
    const cached = cacheGet(key)
    if (cached !== undefined) return cached

    const pending = inflight.get(key)
    if (pending) return pending

    const promise = (async () => {
        try {
            const value = await loader()
            cacheSet(key, value, ttlMs)
            return value
        } finally {
            inflight.delete(key)
        }
    })()

    inflight.set(key, promise)
    return promise
}

export const cacheStats = () => ({
    size: store.size,
    inflight: inflight.size,
})
