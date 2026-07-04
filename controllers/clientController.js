import mongoose from "mongoose"
import Client from "../models/Client.js"
import {
    buildClientSearchFilter,
    clientOwnerFilter,
    formatClientSummary,
    parseClientInput,
} from "../utils/clientFields.js"
import {
    buildPaginationMeta,
    paginatedQuery,
    parsePagination,
} from "../utils/pagination.js"
import { buildUpdatedSinceFilter, parseSinceQuery } from "../utils/incrementalSync.js"
import { isSummaryView } from "../utils/sparseFields.js"
import { sendOwnerJson } from "../utils/listResponse.js"
import { publishOwnerChange } from "../utils/syncRevision.js"

const validationMessage = (error) =>
    Object.values(error.errors)
        .map((e) => e.message)
        .join(", ")

const findOwnedClient = (id, userId) => {
    if (!mongoose.isValidObjectId(id)) {
        return { error: { status: 400, message: "Invalid client id" } }
    }
    return {
        query: Client.findOne({ _id: id, ...clientOwnerFilter(userId) }),
    }
}

export const listClients = async (req, res) => {
    try {
        const search = req.query.search ?? req.query.q
        const sinceParsed = parseSinceQuery(req.query)
        if (sinceParsed?.error) {
            return res.status(400).json({ message: sinceParsed.error })
        }

        const pagination = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 })
        const filter = {
            ...clientOwnerFilter(req.user._id),
            ...buildClientSearchFilter(search),
            ...(sinceParsed?.since
                ? buildUpdatedSinceFilter(sinceParsed.since)
                : {}),
        }
        const summary = isSummaryView(req.query)

        const [total, rows] = await Promise.all([
            Client.countDocuments(filter),
            paginatedQuery(
                Client.find(filter).sort({ createdAt: -1 }),
                pagination
            ).exec(),
        ])

        const clients = summary ? rows.map(formatClientSummary) : rows

        return sendOwnerJson(
            req,
            res,
            req.user._id,
            {
                count: total,
                clients,
                pagination: buildPaginationMeta({ ...pagination, total }),
            },
            {
                etagSeed: {
                    since: sinceParsed?.since?.toISOString() ?? null,
                    view: summary ? "summary" : "full",
                },
            }
        )
    } catch (error) {
        console.error("List clients error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const getClient = async (req, res) => {
    try {
        const { id } = req.params
        const { error, query } = findOwnedClient(id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const client = await query
        if (!client) {
            return res.status(404).json({ message: "Client not found" })
        }

        return res.status(200).json({ client })
    } catch (error) {
        console.error("Get client error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const createClient = async (req, res) => {
    try {
        const { fields, errors } = parseClientInput(req.body)
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }

        const client = await Client.create({
            ...fields,
            owner: req.user._id,
        })

        await publishOwnerChange(req.user._id)

        return res.status(201).json({
            message: "Client created successfully",
            client,
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("Create client error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const updateClient = async (req, res) => {
    try {
        const { id } = req.params
        const { error } = findOwnedClient(id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const { fields, errors } = parseClientInput(req.body, { partial: true })
        if (errors.length) {
            return res.status(400).json({ message: errors[0] })
        }
        if (Object.keys(fields).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" })
        }

        const client = await Client.findOneAndUpdate(
            { _id: id, ...clientOwnerFilter(req.user._id) },
            fields,
            { new: true, runValidators: true }
        )
        if (!client) {
            return res.status(404).json({ message: "Client not found" })
        }

        await publishOwnerChange(req.user._id)

        return res.status(200).json({
            message: "Client updated successfully",
            client,
        })
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: validationMessage(error) })
        }
        console.error("Update client error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}

export const deleteClient = async (req, res) => {
    try {
        const { id } = req.params
        const { error } = findOwnedClient(id, req.user._id)
        if (error) {
            return res.status(error.status).json({ message: error.message })
        }

        const client = await Client.findOneAndDelete({
            _id: id,
            ...clientOwnerFilter(req.user._id),
        })
        if (!client) {
            return res.status(404).json({ message: "Client not found" })
        }

        await publishOwnerChange(req.user._id)

        return res.status(200).json({
            message: "Client deleted successfully",
            client,
        })
    } catch (error) {
        console.error("Delete client error:", error)
        return res.status(500).json({ message: "Server error" })
    }
}
