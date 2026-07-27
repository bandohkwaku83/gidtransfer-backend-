import GalleryPhoto from "../models/GalleryPhoto.js"
import { isGalleryImageMime } from "./galleryMediaTypes.js"
import {
    GalleryAiError,
    openAiConfigured,
    resolveOpenAiApiKey,
} from "./galleryAiDescription.js"
import {
    computePerceptualHash,
    readGalleryPhotoAnalysisBuffer,
} from "./galleryPhotoImageBuffer.js"

import { scheduleGalleryPhotoIndex } from "./opensearchPhotos.js"

export const galleryAiSelectionEnabled = () => {
    const raw = process.env.GALLERY_AI_SELECTION_ENABLED?.trim().toLowerCase()
    if (raw === "false" || raw === "0" || raw === "off") return false
    if (raw === "true" || raw === "1" || raw === "on") return true
    return openAiConfigured()
}

const visionModel = () =>
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"

const ANALYSIS_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        qualityScore: {
            type: "integer",
            description: "Overall photo quality 0-100 for client selection",
        },
        faceCount: {
            type: "integer",
            description: "Number of visible human faces",
        },
        eyesOpen: {
            type: ["boolean", "null"],
            description: "True if main subject eyes are open, null if no faces",
        },
        isBlurry: { type: "boolean" },
        sceneLabel: {
            type: "string",
            enum: [
                "portrait",
                "group",
                "couple",
                "detail",
                "landscape",
                "action",
                "ceremony",
                "reception",
                "other",
            ],
        },
        tags: {
            type: "array",
            items: { type: "string" },
            maxItems: 8,
        },
        issues: {
            type: "array",
            items: { type: "string" },
            maxItems: 6,
            description: "Problems like closed eyes, motion blur, underexposed",
        },
    },
    required: [
        "qualityScore",
        "faceCount",
        "eyesOpen",
        "isBlurry",
        "sceneLabel",
        "tags",
        "issues",
    ],
}

const clampScore = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(100, Math.round(n)))
}

const parseVisionResult = (content) => {
    let parsed
    try {
        parsed = JSON.parse(content)
    } catch {
        throw new GalleryAiError("provider", "AI returned invalid JSON for photo analysis")
    }

    return {
        qualityScore: clampScore(parsed.qualityScore),
        faceCount: Math.max(0, Math.round(Number(parsed.faceCount) || 0)),
        eyesOpen:
            parsed.eyesOpen === null || parsed.eyesOpen === undefined
                ? null
                : Boolean(parsed.eyesOpen),
        isBlurry: Boolean(parsed.isBlurry),
        sceneLabel: String(parsed.sceneLabel ?? "other").trim() || "other",
        tags: Array.isArray(parsed.tags)
            ? parsed.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 8)
            : [],
        issues: Array.isArray(parsed.issues)
            ? parsed.issues.map((t) => String(t).trim()).filter(Boolean).slice(0, 6)
            : [],
    }
}

const analyzeWithVision = async (jpegBuffer, { signal } = {}) => {
    const apiKey = resolveOpenAiApiKey()
    if (!apiKey) {
        throw new GalleryAiError(
            "not_configured",
            "AI selection needs OPENAI_API_KEY in `.env` — then restart the server."
        )
    }

    const base64 = jpegBuffer.toString("base64")
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: visionModel(),
            messages: [
                {
                    role: "system",
                    content:
                        "You evaluate event photos for client gallery selection. Respond with JSON only.",
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "Rate this photo for a client picking favorites. Prefer sharp, well-exposed shots with open eyes. Flag obvious blur or closed eyes on main subjects.",
                        },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64}`,
                                detail: "low",
                            },
                        },
                    ],
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "gallery_photo_analysis",
                    strict: true,
                    schema: ANALYSIS_SCHEMA,
                },
            },
            max_tokens: 300,
            temperature: 0.2,
        }),
        signal,
    })

    if (!res.ok) {
        let openaiMessage = ""
        try {
            const body = await res.json()
            openaiMessage = body?.error?.message ?? ""
        } catch {
            /* ignore */
        }
        throw new GalleryAiError(
            "provider",
            `AI photo analysis failed (${res.status}${openaiMessage ? `: ${openaiMessage}` : ""})`,
            res.status
        )
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
        throw new GalleryAiError("provider", "AI returned empty photo analysis")
    }
    return parseVisionResult(content)
}

/** Analyze one gallery photo and persist results on the document. */
export const analyzeGalleryPhoto = async (photoId, { signal } = {}) => {
    if (!galleryAiSelectionEnabled()) {
        await GalleryPhoto.updateOne(
            { _id: photoId },
            { $set: { "aiAnalysis.status": "skipped" } }
        )
        return null
    }

    const photo = await GalleryPhoto.findById(photoId)
    if (!photo || photo.isVideo || !isGalleryImageMime(photo.mimeType)) {
        if (photo) {
            await GalleryPhoto.updateOne(
                { _id: photoId },
                { $set: { "aiAnalysis.status": "skipped" } }
            )
        }
        return null
    }

    await GalleryPhoto.updateOne(
        { _id: photoId },
        { $set: { "aiAnalysis.status": "processing" } }
    )

    try {
        const jpegBuffer = await readGalleryPhotoAnalysisBuffer(photo)
        if (!jpegBuffer) {
            await GalleryPhoto.updateOne(
                { _id: photoId },
                {
                    $set: {
                        "aiAnalysis.status": "failed",
                        "aiAnalysis.error": "Image file not found",
                    },
                }
            )
            return null
        }

        const [analysis, perceptualHash] = await Promise.all([
            analyzeWithVision(jpegBuffer, { signal }),
            computePerceptualHash(jpegBuffer),
        ])

        await GalleryPhoto.updateOne(
            { _id: photoId },
            {
                $set: {
                    aiAnalysis: {
                        status: "ready",
                        ...analysis,
                        perceptualHash,
                        duplicateGroupId: null,
                        suggested: false,
                        suggestionScore: null,
                        suggestionReason: null,
                        isBestInGroup: false,
                        analyzedAt: new Date(),
                        error: null,
                    },
                },
            }
        )

        const updated = await GalleryPhoto.findById(photoId).exec()
        if (updated) scheduleGalleryPhotoIndex(updated)

        return { photoId, ...analysis, perceptualHash }
    } catch (err) {
        const message =
            err instanceof GalleryAiError
                ? err.message
                : err?.message ?? "Analysis failed"
        await GalleryPhoto.updateOne(
            { _id: photoId },
            {
                $set: {
                    "aiAnalysis.status": "failed",
                    "aiAnalysis.error": message.slice(0, 500),
                    "aiAnalysis.analyzedAt": new Date(),
                },
            }
        )
        throw err
    }
}
