import { sendFeatureDenied, userHasFeature } from "../utils/planFeatures.js"

/** Block a route unless the authenticated photographer has the plan feature. */
export const requirePlanFeature = (featureKey) => (req, res, next) => {
    if (userHasFeature(req.user, featureKey)) {
        return next()
    }
    return sendFeatureDenied(res, featureKey, { user: req.user })
}
