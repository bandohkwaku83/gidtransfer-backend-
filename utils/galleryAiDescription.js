/**
 * Generates a brief gallery intro using OpenAI Chat Completions.
 * Requires OPENAI_API_KEY (aliases: OPEN_API_KEY, OPENAI_KEY).
 */

import { shootTypeLabel } from "./bookingShootTypes.js"

export class GalleryAiError extends Error {
    constructor(code, message, httpStatus) {
        super(message)
        this.name = "GalleryAiError"
        this.code = code
        const defaults = {
            not_configured: 503,
            validation: 400,
            quota: 429,
            rate_limit: 429,
            provider: 502,
        }
        const fallback = defaults[code] ?? 502
        this.statusCode =
            typeof httpStatus === "number" ? httpStatus : fallback
    }
}

export const normalizeGeneratedDescription = (text) =>
    typeof text === "string" ? text.trim().slice(0, 4000) : ""

/** Canonical `OPENAI_API_KEY`, plus fallbacks users sometimes mis-name. */
const OPENAI_KEY_ENV_NAMES = [
    "OPENAI_API_KEY",
    "OPEN_API_KEY",
    "OPENAI_KEY",
]

export const resolveOpenAiApiKey = () => {
    for (const name of OPENAI_KEY_ENV_NAMES) {
        const v = process.env[name]?.trim()
        if (v) return v
    }
    return null
}

export const openAiConfigured = () => Boolean(resolveOpenAiApiKey())

const resolveGalleryTypeLabel = (galleryType) => {
    const raw = typeof galleryType === "string" ? galleryType.trim() : ""
    if (!raw) return ""
    return shootTypeLabel(raw)
}

export const generateGalleryDescriptionFromEventName = async (
    eventName,
    { galleryType, signal } = {}
) => {
    const name = normalizeGeneratedDescription(eventName)
        .slice(0, 300)
        .trim()
    if (!name) {
        throw new GalleryAiError("validation", "Event name is required for AI generation")
    }

    const typeLabel = resolveGalleryTypeLabel(galleryType)

    const apiKey = resolveOpenAiApiKey()
    if (!apiKey) {
        throw new GalleryAiError(
            "not_configured",
            "AI descriptions need an OpenAI API key (OPENAI_API_KEY, or aliases OPEN_API_KEY / OPENAI_KEY) in `.env` next to index.js — then restart npm start."
        )
    }

    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini"
    const system =
        "You write very short, warm photo gallery intros for photographers. Output plain text only, no quotes or markdown."
    const typeLine = typeLabel
        ? `Gallery type: ${typeLabel}.`
        : "Gallery type: not specified."
    const user = `Write 1–2 short sentences (max 35 words total) welcoming clients to their gallery.
Event name: "${name}"
${typeLine}
Match the tone to the gallery type. Do not invent people, venues, dates, or brand names unless they appear in the event name.`

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            max_tokens: 80,
            temperature: 0.6,
        }),
        signal,
    })

    if (!res.ok) {
        let openaiMessage = ""
        try {
            const body = await res.json()
            openaiMessage = body?.error?.message ?? ""
        } catch {
            /* ignore non-JSON error bodies */
        }

        const detail = `${res.status} ${res.statusText}${
            openaiMessage ? `: ${openaiMessage}` : ""
        }`

        /** 429 = rate limit or (usually) insufficient quota / unpaid billing — see OpenAI dashboard. */
        if (res.status === 429) {
            const looksLikeQuota =
                /quota|billing|credit|payment|plan|exceeded your current/i.test(
                    openaiMessage
                )
            if (looksLikeQuota) {
                throw new GalleryAiError(
                    "quota",
                    "OpenAI quota or billing: this key has no usable API spend. Open https://platform.openai.com/account/billing — add credits or a payment method and check Usage/limits in the dashboard. Note: without OPENAI_MODEL set, this server already uses gpt-4o-mini, so billing is usually the fix—not choosing a lighter model.",
                    429
                )
            }
            throw new GalleryAiError(
                "rate_limit",
                "OpenAI rate limited this request; wait briefly and retry.",
                429
            )
        }

        if (res.status === 401) {
            throw new GalleryAiError(
                "provider",
                "OpenAI rejected the API key (invalid, revoked, or wrong project). Generate a fresh key at https://platform.openai.com/api-keys",
                401
            )
        }

        throw new GalleryAiError(
            "provider",
            `AI description request failed (${detail})`,
            res.status >= 400 && res.status < 500 && res.status !== 401
                ? res.status
                : 502
        )
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    const trimmed = normalizeGeneratedDescription(content)
    if (!trimmed) {
        throw new GalleryAiError(
            "provider",
            "AI returned an empty description. Try again."
        )
    }

    return trimmed
}
