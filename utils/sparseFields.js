const FIELD_SPLIT = /[,\s]+/

export const parseFieldsQuery = (query) => {
    const raw = query?.fields ?? query?.field
    if (raw == null || raw === "") return null
    const fields = String(raw)
        .split(FIELD_SPLIT)
        .map((part) => part.trim())
        .filter(Boolean)
    return fields.length ? [...new Set(fields)] : null
}

const pickPath = (source, path) => {
    if (!source || typeof source !== "object") return undefined
    const parts = path.split(".")
    let current = source
    for (const part of parts) {
        if (current == null || typeof current !== "object") return undefined
        current = current[part]
    }
    return current
}

export const pickFields = (value, fields) => {
    if (!fields?.length) return value

    if (Array.isArray(value)) {
        return value.map((item) => pickFields(item, fields))
    }

    if (!value || typeof value !== "object") return value

    const picked = {}
    for (const field of fields) {
        const leaf = field.includes(".") ? field : field
        if (leaf.includes(".")) {
            const val = pickPath(value, leaf)
            if (val !== undefined) {
                const top = leaf.split(".")[0]
                picked[top] = pickFields(value[top], leaf.split(".").slice(1).join("."))
            }
            continue
        }
        if (Object.prototype.hasOwnProperty.call(value, leaf)) {
            picked[leaf] = value[leaf]
        }
    }
    return picked
}

export const isSummaryView = (query) => {
    const view = String(query?.view ?? "").trim().toLowerCase()
    return view === "summary" || view === "list" || view === "card"
}
