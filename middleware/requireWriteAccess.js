import { isViewOnlyLocked } from "../utils/planCatalog.js"
import { sendViewOnlyDenied } from "../utils/planFeatures.js"

const VIEW_ONLY_WRITE_EXEMPT = [
    /^\/api\/billing\/(checkout|verify|resume)\/?$/i,
    /^\/api\/auth\/(logout|signout|verify-email|resend-verification)\/?$/i,
]

const isSafeHttpMethod = (method) => {
    const m = String(method || "").toUpperCase()
    return m === "GET" || m === "HEAD" || m === "OPTIONS"
}

export const isViewOnlyWriteExemptPath = (req) => {
    const path = String(req.originalUrl || req.url || "").split("?")[0]
    return VIEW_ONLY_WRITE_EXEMPT.some((re) => re.test(path))
}

/**
 * After trial/subscription + 3-day grace, block create/update/delete.
 * Viewing (GET) and billing renewal stay allowed.
 */
export const enforceViewOnlyWrites = (req, res, next) => {
    if (isSafeHttpMethod(req.method)) return next()
    if (isViewOnlyWriteExemptPath(req)) return next()
    if (!req.user || !isViewOnlyLocked(req.user)) return next()
    return sendViewOnlyDenied(res, req.user)
}
