import {
    loadActiveStudioMembership,
    formatMembershipResponse,
} from "./studioContext.js"
import { formatUserResponse } from "./formatUserResponse.js"

/**
 * Shape login / me payloads for owners and studio staff.
 *
 * When `req` is present, we assume `protectUser` has already resolved
 * (`req.actor`, `req.user`, `req.membership`, `req.studioOwnerId`). We use
 * that context directly instead of re-querying the studio membership.
 *
 * @param {object} actorUser - the logged-in account
 * @param {object} [req] - optional express req populated by `protectUser`
 */
export const formatAuthUserPayload = async (actorUser, req = null) => {
    if (req && Object.prototype.hasOwnProperty.call(req, "membership")) {
        if (!req.membership) {
            return formatUserResponse(req.actor ?? actorUser, {
                accountType: "owner",
            })
        }
        return formatUserResponse(req.actor ?? actorUser, {
            planFrom: req.user,
            studioFrom: req.user,
            accountType: "member",
            membership: formatMembershipResponse(req.membership),
            studioOwnerId: req.studioOwnerId ?? req.user._id,
        })
    }

    const ctx = await loadActiveStudioMembership(actorUser._id)
    if (!ctx) {
        return formatUserResponse(actorUser, { accountType: "owner" })
    }

    return formatUserResponse(actorUser, {
        planFrom: ctx.owner,
        studioFrom: ctx.owner,
        accountType: "member",
        membership: formatMembershipResponse(ctx.membership),
        studioOwnerId: ctx.owner._id,
    })
}
