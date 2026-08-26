import {
    loadActiveStudioMembership,
    formatMembershipResponse,
} from "./studioContext.js"
import { formatUserResponse } from "./formatUserResponse.js"

/**
 * Shape login / me payloads for owners and studio staff.
 * @param {object} actorUser - the logged-in account
 * @param {object} [req] - optional express req with membership already attached
 */
export const formatAuthUserPayload = async (actorUser, req = null) => {
    if (req?.membership && req?.user && req?.actor) {
        return formatUserResponse(req.actor, {
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
