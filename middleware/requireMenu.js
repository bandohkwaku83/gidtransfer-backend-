import { actorHasMenu, isStudioOwnerAccount } from "../utils/studioContext.js"

/** Block unless the caller may use this app menu. Owners always pass. */
export const requireMenu = (menuKey) => (req, res, next) => {
    if (actorHasMenu(req, menuKey)) return next()
    return res.status(403).json({
        message: `You do not have access to ${menuKey}`,
        code: "MENU_FORBIDDEN",
        menu: menuKey,
    })
}

/** Team management & billing — studio owner account only (not staff). */
export const requireStudioOwner = (req, res, next) => {
    if (isStudioOwnerAccount(req)) return next()
    return res.status(403).json({
        message: "Only the studio owner can do this",
        code: "STUDIO_OWNER_REQUIRED",
    })
}
