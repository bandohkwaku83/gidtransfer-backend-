import { parseAmountCharged } from "./bookingFields.js"

const pad2 = (n) => String(n).padStart(2, "0")

export const parseInvoiceDate = (raw) => {
    const date = raw?.trim()
    if (!date) {
        const now = new Date()
        return new Date(
            Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
        )
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const parsed = new Date(`${date}T12:00:00.000Z`)
        if (!Number.isNaN(parsed.getTime())) {
            return { date: parsed }
        }
    }
    const parsed = new Date(date)
    if (!Number.isNaN(parsed.getTime())) {
        return { date: parsed }
    }
    return { error: "Valid issued date (YYYY-MM-DD) is required" }
}

export const parseInvoiceAddOns = (raw) => {
    if (raw === undefined || raw === null) {
        return { addOns: [] }
    }
    if (!Array.isArray(raw)) {
        return { error: "Add-ons must be an array" }
    }

    const addOns = []
    for (const item of raw) {
        const label = item?.label?.trim()
        const amountResult = parseAmountCharged(item?.amount)
        if (amountResult.error) {
            return { error: amountResult.error.replace("Amount charged", "Add-on amount") }
        }
        const amount = amountResult.value ?? 0
        if (!label || amount <= 0) continue
        addOns.push({ label, amount })
    }

    return { addOns }
}

export const computeInvoiceTotal = (baseAmount, addOns = []) => {
    const base = Math.max(0, Number(baseAmount) || 0)
    const extras = addOns.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0)
    return Math.round((base + extras) * 100) / 100
}

export const buildInvoiceNumber = (bookingId, issuedOnIso) => {
    const suffix =
        String(bookingId)
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(-6)
            .toUpperCase() || "000000"
    const compact = String(issuedOnIso).replace(/-/g, "")
    return `INV-${compact}-${suffix}`
}

export const issuedOnIsoDate = (date = new Date()) => {
    const d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return null
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}
