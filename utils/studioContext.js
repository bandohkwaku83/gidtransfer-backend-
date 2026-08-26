import StudioMembership from "../models/StudioMembership.js"
import User from "../models/User.js"
import { formatRolePresets, formatMenuCatalog } from "./studioMenus.js"

/**
 * Load active studio membership for a staff user.
 * @returns {null | { membership, owner }}
 */
export const loadActiveStudioMembership = async (userId) => {
    if (!userId) return null
    const membership = await StudioMembership.findOne({
        user: userId,
        status: "active",
    }).exec()
    if (!membership) return null

    const owner = await User.findById(membership.studioOwner).exec()
    if (!owner || owner.isActive === false) return null

    return { membership, owner }
}

export const formatMembershipResponse = (membership) => {
    if (!membership) return null
    const doc = membership.toObject ? membership.toObject() : membership
    return {
        id: String(doc._id),
        studioOwnerId: String(doc.studioOwner._id ?? doc.studioOwner),
        userId: String(doc.user._id ?? doc.user),
        email: doc.email ?? "",
        displayName: doc.displayName ?? "",
        role: doc.role,
        menuKeys: Array.isArray(doc.menuKeys) ? [...doc.menuKeys] : [],
        status: doc.status,
        createdAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
    }
}

export const countStudioSeats = async (studioOwnerId) =>
    StudioMembership.countDocuments({
        studioOwner: studioOwnerId,
        status: "active",
    })

/** Logged-in person (staff or owner). */
export const actorUser = (req) => req.actor ?? req.user

/** True when the JWT user is staff acting inside an owner's studio. */
export const isStudioStaff = (req) => Boolean(req.membership)

/** Owner-only actions (team, billing). */
export const isStudioOwnerAccount = (req) =>
    !req.membership && Boolean(req.user?._id)

export const actorHasMenu = (req, menuKey) => {
    if (isStudioOwnerAccount(req)) return true
    const keys = req.membership?.menuKeys
    if (!Array.isArray(keys)) return false
    return keys.includes(String(menuKey))
}

export const studioMetaPayload = () => ({
    menus: formatMenuCatalog(),
    roles: formatRolePresets(),
})
