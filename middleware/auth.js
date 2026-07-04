import jwt from "jsonwebtoken"
import Admin from "../models/Admin.js"
import { cacheGetOrSet } from "../utils/memoryCache.js"

const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS ?? 60_000)

const loadActiveAdmin = async (adminId) =>
    cacheGetOrSet(
        `auth:admin:${adminId}`,
        async () => {
            const admin = await Admin.findById(adminId).lean()
            if (!admin || !admin.isActive) return null
            return admin
        },
        AUTH_CACHE_TTL_MS
    )

export const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res
                .status(401)
                .json({ message: "Not authorized, token missing" })
        }

        const token = authHeader.split(" ")[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        if (decoded.kind && decoded.kind !== "admin") {
            return res.status(401).json({ message: "Not authorized, token invalid" })
        }

        const admin = await loadActiveAdmin(decoded.id)
        if (!admin) {
            return res.status(401).json({ message: "Admin no longer exists" })
        }

        req.admin = Admin.hydrate(admin)
        next()
    } catch {
        return res.status(401).json({ message: "Not authorized, token invalid" })
    }
}
