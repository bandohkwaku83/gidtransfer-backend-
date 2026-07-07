import mongoose from "mongoose"
import IssueReport from "../models/IssueReport.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import {
    formatIssueReportResponse,
    ISSUE_TOPIC_LABELS,
} from "../utils/issueReportFields.js"

const formatAdminIssueReportRow = (report) => {
    const base = formatIssueReportResponse(report)
    const doc = report.toJSON ? report.toJSON() : report

    return {
        ...base,
        accountId: doc.accountId?.trim() || null,
        userEmail: doc.userEmail,
        ownerId: doc.owner,
        updatedAt: doc.updatedAt,
    }
}

export const listIssueReports = async (req, res) => {
    try {
        const pagination = parsePagination(req.query, {
            defaultLimit: 50,
            maxLimit: 200,
        })
        const filter = {}

        const status = String(req.query.status ?? "open").trim()
        if (status !== "all") {
            filter.status = status
        }

        const topic = String(req.query.topic ?? "").trim()
        if (topic) {
            filter.topic = topic
        }

        const search = String(req.query.search ?? req.query.q ?? "").trim()
        if (search) {
            const regex = new RegExp(
                search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "i"
            )
            filter.$or = [
                { userEmail: regex },
                { accountId: regex },
                { description: regex },
            ]
        }

        const [total, reports] = await Promise.all([
            IssueReport.countDocuments(filter),
            paginatedQuery(
                IssueReport.find(filter).sort({ createdAt: -1 }),
                pagination
            ).exec(),
        ])

        return res.status(200).json({
            items: reports.map(formatAdminIssueReportRow),
            topics: Object.entries(ISSUE_TOPIC_LABELS).map(([id, label]) => ({
                id,
                label,
            })),
            pagination: buildPaginationMeta({ ...pagination, total }),
        })
    } catch (error) {
        console.error("listIssueReports:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateIssueReport = async (req, res) => {
    try {
        const { id } = req.params
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ message: "Invalid report id" })
        }

        const report = await IssueReport.findById(id)
        if (!report) {
            return res.status(404).json({ message: "Report not found" })
        }

        const status = String(req.body?.status ?? "").trim()
        if (!status) {
            return res.status(400).json({ message: "status is required" })
        }
        if (!["open", "resolved"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" })
        }

        report.status = status
        await report.save()

        return res.status(200).json({
            message: status === "resolved" ? "Report resolved" : "Report reopened",
            report: formatAdminIssueReportRow(report),
        })
    } catch (error) {
        console.error("updateIssueReport:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
