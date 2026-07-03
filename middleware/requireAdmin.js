export const requireAdmin = (req, res, next) => {
    if (!req.admin) {
        return res.status(403).json({ message: "Admin access required" })
    }
    next()
}
