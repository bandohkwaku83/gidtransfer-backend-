import AdminAuditLog from "../models/AdminAuditLog.js"

export const logAdminAction = async ({
    admin,
    action,
    reason = "",
    resourceType = "",
    resourceId = "",
    meta = {},
}) => {
    if (!admin?._id) return null

    return AdminAuditLog.create({
        admin: admin._id,
        adminEmail: admin.email,
        adminRole: admin.role || "admin",
        action,
        reason: String(reason ?? "").trim(),
        resourceType: String(resourceType ?? "").trim(),
        resourceId: String(resourceId ?? "").trim(),
        meta: meta && typeof meta === "object" ? meta : {},
    })
}

export const requireAuditReason = (raw, { minLength = 3 } = {}) => {
    const reason = String(raw ?? "").trim()
    if (reason.length < minLength) {
        return {
            error: `reason is required (min ${minLength} characters)`,
            reason: "",
        }
    }
    return { error: null, reason }
}

export const formatAdminAuditLog = (doc) => {
    const plain = doc?.toObject?.() ?? doc ?? {}
    return {
        id: plain._id ?? plain.id,
        adminId: plain.admin,
        adminEmail: plain.adminEmail,
        adminRole: plain.adminRole || "admin",
        action: plain.action,
        reason: plain.reason || "",
        resourceType: plain.resourceType || "",
        resourceId: plain.resourceId || "",
        meta: plain.meta ?? {},
        createdAt: plain.createdAt,
    }
}
