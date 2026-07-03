import { MAX_GALLERY_BATCH_FILES } from "./galleryMediaTypes.js"

/** Normalize file metadata from JSON body (presign / complete). */
export const parseDirectUploadFiles = (body) => {
    const raw = body?.files ?? body?.uploads ?? body?.items
    if (!Array.isArray(raw) || !raw.length) {
        return { error: "Provide a non-empty files array" }
    }
    if (raw.length > MAX_GALLERY_BATCH_FILES) {
        return {
            error: `Too many files (max ${MAX_GALLERY_BATCH_FILES} per batch)`,
        }
    }

    const files = raw.map((item, index) => {
        const originalFilename =
            item.originalFilename ??
            item.original_filename ??
            item.filename ??
            item.name ??
            `upload-${index + 1}`
        const mimeType =
            item.mimeType ?? item.mime_type ?? item.contentType ?? item.type
        const sizeBytes = Number(
            item.sizeBytes ?? item.size_bytes ?? item.size ?? item.contentLength
        )
        const storedFilename = item.storedFilename ?? item.stored_filename
        const uploadId = item.uploadId ?? item.upload_id

        return {
            originalFilename: String(originalFilename).trim(),
            mimeType: mimeType ? String(mimeType).trim() : "",
            sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
            storedFilename: storedFilename ? String(storedFilename).trim() : "",
            uploadId: uploadId ? String(uploadId).trim() : "",
        }
    })

    for (const file of files) {
        if (!file.mimeType) {
            return { error: "Each file must include mimeType" }
        }
        if (file.sizeBytes == null || file.sizeBytes <= 0) {
            return { error: "Each file must include sizeBytes" }
        }
    }

    return { files }
}
