import User from "../models/User.js"
import Client from "../models/Client.js"
import Gallery from "../models/Gallery.js"
import IssueReport from "../models/IssueReport.js"
import { galleryNotDeletedFilter } from "../utils/galleryFields.js"

const countFacet = (field) => ({
    $group: {
        _id: `$${field}`,
        count: { $sum: 1 },
    },
})

const facetToMap = (rows) =>
    Object.fromEntries(
        (rows ?? []).map((row) => [row._id ?? "unknown", row.count])
    )

export const getAdminStats = async (_req, res) => {
    try {
        const [
            userAgg,
            clientCount,
            galleryAgg,
            openIssueReports,
            pendingSmsSenders,
        ] = await Promise.all([
            User.aggregate([
                {
                    $facet: {
                        totals: [
                            {
                                $group: {
                                    _id: null,
                                    total: { $sum: 1 },
                                    onboarded: {
                                        $sum: {
                                            $cond: [
                                                {
                                                    $ne: [
                                                        "$onboardingCompletedAt",
                                                        null,
                                                    ],
                                                },
                                                1,
                                                0,
                                            ],
                                        },
                                    },
                                    emailVerified: {
                                        $sum: {
                                            $cond: [
                                                {
                                                    $ne: [
                                                        "$emailVerifiedAt",
                                                        null,
                                                    ],
                                                },
                                                1,
                                                0,
                                            ],
                                        },
                                    },
                                    active: {
                                        $sum: {
                                            $cond: ["$isActive", 1, 0],
                                        },
                                    },
                                },
                            },
                        ],
                        byPlan: [countFacet("subscription.planId")],
                        bySubscriptionStatus: [
                            countFacet("subscription.status"),
                        ],
                        bySmsSenderStatus: [
                            countFacet("studio.smsSenderStatus"),
                        ],
                        byAuthProvider: [countFacet("authProvider")],
                    },
                },
            ]),
            Client.countDocuments(),
            Gallery.aggregate([
                {
                    $facet: {
                        active: [
                            { $match: galleryNotDeletedFilter() },
                            { $count: "n" },
                        ],
                        trashed: [
                            { $match: { deletedAt: { $ne: null } } },
                            { $count: "n" },
                        ],
                        byStatus: [
                            { $match: galleryNotDeletedFilter() },
                            countFacet("status"),
                        ],
                    },
                },
            ]),
            IssueReport.countDocuments({ status: "open" }),
            User.countDocuments({ "studio.smsSenderStatus": "pending" }),
        ])

        const userStats = userAgg[0] ?? {}
        const totals = userStats.totals?.[0] ?? {
            total: 0,
            onboarded: 0,
            emailVerified: 0,
            active: 0,
        }
        const galleryStats = galleryAgg[0] ?? {}

        return res.status(200).json({
            photographers: {
                total: totals.total,
                onboarded: totals.onboarded,
                notOnboarded: totals.total - totals.onboarded,
                emailVerified: totals.emailVerified,
                emailUnverified: totals.total - totals.emailVerified,
                active: totals.active,
                inactive: totals.total - totals.active,
                byPlan: facetToMap(userStats.byPlan),
                bySubscriptionStatus: facetToMap(userStats.bySubscriptionStatus),
                bySmsSenderStatus: facetToMap(userStats.bySmsSenderStatus),
                byAuthProvider: facetToMap(userStats.byAuthProvider),
                pendingSmsSenders,
            },
            clients: {
                total: clientCount,
            },
            galleries: {
                active: galleryStats.active?.[0]?.n ?? 0,
                trashed: galleryStats.trashed?.[0]?.n ?? 0,
                byStatus: facetToMap(galleryStats.byStatus),
            },
            support: {
                openIssueReports,
            },
        })
    } catch (error) {
        console.error("getAdminStats:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
