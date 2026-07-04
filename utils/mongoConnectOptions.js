const parsePositiveInt = (value, fallback) => {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : fallback
}

export const mongoConnectOptions = () => ({
    maxPoolSize: parsePositiveInt(process.env.MONGO_MAX_POOL_SIZE, 20),
    minPoolSize: parsePositiveInt(process.env.MONGO_MIN_POOL_SIZE, 2),
    maxIdleTimeMS: parsePositiveInt(process.env.MONGO_MAX_IDLE_MS, 30_000),
    serverSelectionTimeoutMS: parsePositiveInt(
        process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        10_000
    ),
    socketTimeoutMS: parsePositiveInt(process.env.MONGO_SOCKET_TIMEOUT_MS, 45_000),
})
