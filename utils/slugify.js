/** Lowercase URL-safe slug from arbitrary text. */
export const slugify = (text) => {
    if (!text || typeof text !== "string") return ""
    return text
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80)
}

/**
 * Pick a slug unique within `exists(slug)`.
 * Appends -2, -3, … when the base is taken.
 */
export const uniqueSlug = async (baseText, exists) => {
    const base = slugify(baseText) || "gallery"
    if (!(await exists(base))) return base
    for (let n = 2; n < 10_000; n++) {
        const candidate = `${base}-${n}`
        if (!(await exists(candidate))) return candidate
    }
    return `${base}-${Date.now()}`
}
