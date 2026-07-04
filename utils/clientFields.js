import mongoose from "mongoose"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Fields loaded when a gallery populates its client. */
export const GALLERY_CLIENT_SELECT =
    "name email phone location createdAt updatedAt"

export const GALLERY_CLIENT_POPULATE = {
    path: "client",
    select: GALLERY_CLIENT_SELECT,
}

export const formatClientEmbed = (client) => {
    if (!client) return null

    if (typeof client === "string" || client instanceof mongoose.Types.ObjectId) {
        return { id: String(client) }
    }

    const c = client.toObject?.() ?? client
    const id = c._id ?? c.id

    const isPopulated =
        c.name != null ||
        c.email != null ||
        c.phone != null ||
        c.location != null

    if (!isPopulated) {
        if (id != null) return { id: String(id) }
        if (mongoose.isValidObjectId(c)) return { id: String(c) }
        return null
    }

    if (!id) return null

    return {
        id: String(id),
        name: c.name ?? "",
        email: c.email?.trim() || "",
        phone: c.phone ?? "",
        location: c.location ?? "",
        createdAt: c.createdAt ?? null,
        updatedAt: c.updatedAt ?? null,
    }
}

export const formatClientSummary = (client) => {
    const full = formatClientEmbed(client)
    if (!full) return null
    return {
        id: full.id,
        name: full.name,
        email: full.email,
        phone: full.phone,
        updatedAt: full.updatedAt,
    }
}

export const parseClientInput = (body, { partial = false } = {}) => {
    const { name, email, phone, contactNumber, location } = body
    const fields = {}
    const errors = []

    if (name !== undefined || !partial) {
        const trimmed = name?.trim()
        if (!trimmed) {
            if (!partial) errors.push("Client name is required")
        } else {
            fields.name = trimmed
        }
    }

    if (email !== undefined || !partial) {
        const normalized = (email?.trim().toLowerCase() ?? "") || ""
        if (normalized && !EMAIL_REGEX.test(normalized)) {
            errors.push("Invalid email address")
        } else {
            fields.email = normalized
        }
    }

    if (phone !== undefined || contactNumber !== undefined || !partial) {
        const resolved = (phone ?? contactNumber)?.trim()
        if (!resolved) {
            if (!partial) errors.push("Contact number is required")
        } else {
            fields.phone = resolved
        }
    }

    if (location !== undefined || !partial) {
        const trimmed = location?.trim()
        if (!trimmed) {
            if (!partial) errors.push("Location is required")
        } else {
            fields.location = trimmed
        }
    }

    return { fields, errors }
}

export const clientOwnerFilter = (userId) => ({
    owner: userId,
})

export const buildClientSearchFilter = (search) => {
    const q = search?.trim()
    if (!q) return {}

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    return {
        $or: [
            { name: regex },
            { email: regex },
            { phone: regex },
            { location: regex },
        ],
    }
}
