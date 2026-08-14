import mongoose from "mongoose"
import User from "../models/User.js"
import PlanConfig from "../models/PlanConfig.js"
import BillingEvent from "../models/BillingEvent.js"
import {
    getAllPlans,
    getPlanById,
    getPlanDefinitionIds,
    loadPlanCatalogOverridesFromDb,
    normalizePlanId,
} from "../utils/planCatalog.js"
import { formatBytesLabel } from "../utils/storageFields.js"
import {
    formatFeatureCatalog,
    formatPlanComparison,
    getPlanFeatureMap,
    sanitizeFeatureKeys,
} from "../utils/planFeatures.js"
import { formatBillingSubscriptionResponse } from "../utils/subscriptionFields.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import { logAdminAction, requireAuditReason } from "../utils/adminAudit.js"

const formatPlanAdmin = (plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    storageLimitBytes: plan.storageLimitBytes,
    storageBytes: plan.storageLimitBytes,
    storageLabel: formatBytesLabel(plan.storageLimitBytes),
    maxGalleries: plan.maxGalleries ?? null,
        maxTeamMembers: plan.maxTeamMembers ?? null,
        videoUploadLimitBytes: plan.videoUploadLimitBytes ?? 0,
        videoUploadLimitLabel: formatBytesLabel(plan.videoUploadLimitBytes ?? 0),
    perks: plan.perks ?? [],
    features: getPlanFeatureMap(plan),
    featureKeys: plan.featureKeys ?? [],
    supportTier: plan.supportTier || "contact",
    highlighted: plan.highlighted === true,
    aliases: plan.aliases ?? [],
    priceGhs: plan.priceGhs,
    price: plan.priceGhs,
    interval: plan.interval,
    trialDays: plan.trialDays ?? null,
    paystackPlanCode: plan.paystackPlanCode ?? null,
    available:
        plan.available ??
        (plan.id === "free" || Boolean(plan.paystackPlanCode)),
})

export const listAdminPlans = async (_req, res) => {
    try {
        return res.status(200).json({
            plans: getAllPlans().map(formatPlanAdmin),
            featureCatalog: formatFeatureCatalog(),
            comparison: formatPlanComparison(),
        })
    } catch (error) {
        console.error("listAdminPlans:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateAdminPlan = async (req, res) => {
    try {
        const planId = normalizePlanId(req.params.planId ?? "")
        if (!getPlanDefinitionIds().includes(planId)) {
            return res.status(404).json({ message: "Unknown plan id" })
        }

        const { error: reasonError, reason } = requireAuditReason(
            req.body?.reason ?? "Plan catalog update"
        )
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const patch = {}
        if (req.body?.name !== undefined) {
            const name = String(req.body.name).trim()
            if (!name) {
                return res.status(400).json({ message: "name cannot be empty" })
            }
            patch.name = name
        }
        if (req.body?.description !== undefined) {
            patch.description = String(req.body.description)
        }

        const storageRaw =
            req.body?.storageLimitBytes ??
            req.body?.storageBytes ??
            req.body?.storage_bytes
        if (storageRaw !== undefined) {
            const n = Number(storageRaw)
            if (!Number.isFinite(n) || n < 0) {
                return res.status(400).json({
                    message: "storageLimitBytes must be a non-negative number",
                })
            }
            patch.storageLimitBytes = Math.floor(n)
        }

        if (req.body?.maxGalleries !== undefined) {
            if (req.body.maxGalleries === null) {
                patch.maxGalleries = null
            } else {
                const n = Number(req.body.maxGalleries)
                if (!Number.isInteger(n) || n < 0) {
                    return res.status(400).json({
                        message:
                            "maxGalleries must be null (unlimited) or a non-negative integer",
                    })
                }
                patch.maxGalleries = n
            }
        }

        if (req.body?.priceGhs !== undefined || req.body?.price !== undefined) {
            const n = Number(req.body.priceGhs ?? req.body.price)
            if (!Number.isFinite(n) || n < 0) {
                return res.status(400).json({
                    message: "priceGhs must be a non-negative number",
                })
            }
            patch.priceGhs = Math.round(n * 100) / 100
        }

        if (req.body?.perks !== undefined) {
            if (!Array.isArray(req.body.perks)) {
                return res.status(400).json({ message: "perks must be an array of strings" })
            }
            patch.perks = req.body.perks.map((p) => String(p).trim()).filter(Boolean)
        }

        if (req.body?.featureKeys !== undefined || req.body?.features !== undefined) {
            const raw = req.body.featureKeys ?? req.body.features
            const keys = sanitizeFeatureKeys(raw)
            if (!keys) {
                return res.status(400).json({
                    message: "featureKeys must be an array of known feature keys",
                })
            }
            patch.featureKeys = keys
        }

        if (req.body?.videoUploadLimitBytes !== undefined) {
            if (req.body.videoUploadLimitBytes === null) {
                patch.videoUploadLimitBytes = 0
            } else {
                const n = Number(req.body.videoUploadLimitBytes)
                if (!Number.isFinite(n) || n < 0) {
                    return res.status(400).json({
                        message:
                            "videoUploadLimitBytes must be a non-negative number",
                    })
                }
                patch.videoUploadLimitBytes = Math.floor(n)
            }
        }

        if (req.body?.maxTeamMembers !== undefined) {
            if (req.body.maxTeamMembers === null) {
                patch.maxTeamMembers = null
            } else {
                const n = Number(req.body.maxTeamMembers)
                if (!Number.isInteger(n) || n < 0) {
                    return res.status(400).json({
                        message:
                            "maxTeamMembers must be null (unlimited) or a non-negative integer",
                    })
                }
                patch.maxTeamMembers = n
            }
        }

        if (req.body?.supportTier !== undefined) {
            const tier = String(req.body.supportTier).trim().toLowerCase()
            if (!["contact", "email", "priority", "premium"].includes(tier)) {
                return res.status(400).json({
                    message: "supportTier must be contact, priority, or premium",
                })
            }
            patch.supportTier = tier === "email" ? "contact" : tier
        }

        if (!Object.keys(patch).length) {
            return res.status(400).json({
                message:
                    "Provide at least one of name, description, storageLimitBytes, maxGalleries, maxTeamMembers, videoUploadLimitBytes, priceGhs, perks, featureKeys, supportTier",
            })
        }

        await PlanConfig.findOneAndUpdate(
            { planId },
            {
                $set: {
                    ...patch,
                    planId,
                    updatedBy: req.admin._id,
                    updatedByEmail: req.admin.email,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        )

        await loadPlanCatalogOverridesFromDb(PlanConfig)
        await logAdminAction({
            admin: req.admin,
            action: "billing.plan.update",
            reason,
            resourceType: "plan",
            resourceId: planId,
            meta: patch,
        })

        const plan = getPlanById(planId)
        return res.status(200).json({
            message: "Plan updated",
            plan: formatPlanAdmin(plan),
        })
    } catch (error) {
        console.error("updateAdminPlan:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const setPhotographerLimitOverride = async (req, res) => {
    try {
        const { userId } = req.params
        if (!mongoose.isValidObjectId(userId)) {
            return res.status(400).json({ message: "Invalid user id" })
        }

        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({ message: "Photographer not found" })
        }

        const { error: reasonError, reason } = requireAuditReason(req.body?.reason)
        if (reasonError) {
            return res.status(400).json({ message: reasonError })
        }

        const clear =
            req.body?.clear === true ||
            req.body?.clear === "true" ||
            req.body?.remove === true

        if (clear) {
            user.subscription = user.subscription ?? {}
            user.subscription.limitOverride = {
                storageLimitBytes: null,
                maxGalleries: null,
                expiresAt: null,
                reason: "",
                setByAdmin: null,
                setAt: null,
            }
            await user.save()
            await logAdminAction({
                admin: req.admin,
                action: "billing.limit_override.clear",
                reason,
                resourceType: "user",
                resourceId: String(user._id),
            })
            return res.status(200).json({
                message: "Limit override cleared",
                subscription: formatBillingSubscriptionResponse(user),
            })
        }

        const storageRaw =
            req.body?.storageLimitBytes ??
            req.body?.storageBytes ??
            req.body?.storage_bytes
        const galleriesRaw = req.body?.maxGalleries

        if (storageRaw === undefined && galleriesRaw === undefined) {
            return res.status(400).json({
                message:
                    "Provide storageLimitBytes and/or maxGalleries, or clear=true",
            })
        }

        let storageLimitBytes = null
        if (storageRaw !== undefined && storageRaw !== null) {
            const n = Number(storageRaw)
            if (!Number.isFinite(n) || n < 0) {
                return res.status(400).json({
                    message: "storageLimitBytes must be a non-negative number",
                })
            }
            storageLimitBytes = Math.floor(n)
        }

        let maxGalleries = null
        if (galleriesRaw !== undefined && galleriesRaw !== null) {
            const n = Number(galleriesRaw)
            if (!Number.isInteger(n) || n < 0) {
                return res.status(400).json({
                    message: "maxGalleries must be a non-negative integer",
                })
            }
            maxGalleries = n
        }

        let expiresAt = null
        if (req.body?.expiresAt !== undefined && req.body?.expiresAt !== null) {
            const d = new Date(req.body.expiresAt)
            if (Number.isNaN(d.getTime())) {
                return res.status(400).json({ message: "Invalid expiresAt" })
            }
            expiresAt = d
        } else if (req.body?.expiresInDays != null) {
            const days = Number(req.body.expiresInDays)
            if (!Number.isInteger(days) || days < 1) {
                return res.status(400).json({
                    message: "expiresInDays must be a positive integer",
                })
            }
            expiresAt = new Date(Date.now() + days * 86_400_000)
        }

        user.subscription = user.subscription ?? {}
        const existing = user.subscription.limitOverride ?? {}
        user.subscription.limitOverride = {
            storageLimitBytes:
                storageRaw === undefined
                    ? existing.storageLimitBytes ?? null
                    : storageLimitBytes,
            maxGalleries:
                galleriesRaw === undefined
                    ? existing.maxGalleries ?? null
                    : maxGalleries,
            expiresAt,
            reason,
            setByAdmin: req.admin._id,
            setAt: new Date(),
        }
        await user.save()

        await logAdminAction({
            admin: req.admin,
            action: "billing.limit_override.set",
            reason,
            resourceType: "user",
            resourceId: String(user._id),
            meta: user.subscription.limitOverride,
        })

        return res.status(200).json({
            message: "Limit override applied",
            subscription: formatBillingSubscriptionResponse(user),
        })
    } catch (error) {
        console.error("setPhotographerLimitOverride:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const listAdminBillingEvents = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = {}

        const category = String(req.query.category ?? "").trim().toLowerCase()
        if (category) {
            if (!["paid", "failed", "dispute", "other"].includes(category)) {
                return res.status(400).json({
                    message: "category must be paid|failed|dispute|other",
                })
            }
            filter.category = category
        }

        const eventType = String(req.query.eventType ?? "").trim()
        if (eventType) {
            filter.eventType = eventType
        }

        const userId = String(req.query.userId ?? req.query.ownerId ?? "").trim()
        if (userId) {
            if (!mongoose.isValidObjectId(userId)) {
                return res.status(400).json({ message: "Invalid userId" })
            }
            filter.user = userId
        }

        const reference = String(req.query.reference ?? "").trim()
        if (reference) {
            filter.reference = reference
        }

        const [total, rows] = await Promise.all([
            BillingEvent.countDocuments(filter),
            paginatedQuery(
                BillingEvent.find(filter)
                    .populate({
                        path: "user",
                        select: "email studio.companyName studio.companySlug subscription.planId",
                    })
                    .sort({ createdAt: -1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            items: rows.map((row) => {
                const plain = row.toObject?.() ?? row
                const user = plain.user?.toObject?.() ?? plain.user
                return {
                    id: plain._id,
                    eventId: plain.eventId,
                    eventType: plain.eventType,
                    category: plain.category || "other",
                    reference: plain.reference || "",
                    amount: plain.amount,
                    currency: plain.currency || "",
                    status: plain.status || "",
                    processedAt: plain.processedAt,
                    createdAt: plain.createdAt,
                    user: user
                        ? {
                              userId: user._id,
                              email: user.email,
                              companyName:
                                  user.studio?.companyName?.trim() || "",
                              companySlug:
                                  user.studio?.companySlug?.trim() || "",
                              planId: user.subscription?.planId || "free",
                          }
                        : null,
                }
            }),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listAdminBillingEvents:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
