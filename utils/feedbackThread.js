const feedbackMessageSchemaShape = {
    role: { type: String, enum: ["client", "photographer"], required: true },
    body: { type: String, trim: true, required: true },
}

export const feedbackMessageSchemaOptions = feedbackMessageSchemaShape

export const appendFeedbackMessage = (doc, role, body) => {
    const text = String(body ?? "").trim()
    if (!text) return false

    if (!Array.isArray(doc.feedbackThread)) {
        doc.feedbackThread = []
    }

    doc.feedbackThread.push({
        role,
        body: text,
        createdAt: new Date(),
    })

    if (role === "client") {
        doc.clientComment = text
    } else if (role === "photographer") {
        doc.photographerReply = text
        doc.photographerRepliedAt = new Date()
    }

    return true
}

export const buildFeedbackThread = (doc) => {
    const plain = doc?.toObject?.() ?? doc ?? {}
    if (Array.isArray(plain.feedbackThread) && plain.feedbackThread.length > 0) {
        return plain.feedbackThread.map((m) => ({
            role: m.role,
            body: m.body ?? "",
            createdAt: m.createdAt ?? null,
        }))
    }

    const thread = []
    if (plain.clientComment?.trim()) {
        thread.push({
            role: "client",
            body: plain.clientComment.trim(),
            createdAt: plain.selectedAt ?? plain.flaggedAt ?? plain.updatedAt ?? null,
        })
    }
    if (plain.photographerReply?.trim()) {
        thread.push({
            role: "photographer",
            body: plain.photographerReply.trim(),
            createdAt: plain.photographerRepliedAt ?? plain.updatedAt ?? null,
        })
    }
    return thread
}

export const formatFeedbackResponse = (doc) => {
    const thread = buildFeedbackThread(doc)
    const plain = doc?.toObject?.() ?? doc ?? {}
    return {
        clientComment: plain.clientComment ?? "",
        photographerReply: plain.photographerReply ?? "",
        photographerRepliedAt: plain.photographerRepliedAt ?? null,
        thread,
        comments: thread,
    }
}
