import jwt from "jsonwebtoken"
import Admin from "../models/Admin.js"

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

        const admin = await Admin.findById(decoded.id)
        if (!admin || !admin.isActive) {
            return res.status(401).json({ message: "Admin no longer exists" })
        }

        req.admin = admin
        next()
    } catch {
        return res.status(401).json({ message: "Not authorized, token invalid" })
    }
}
