import {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const DEFAULT_PRESIGN_EXPIRES_SECONDS = 3600
const AWS_REGION_PATTERN = /([a-z]{2}-[a-z]+-\d+)/i

let _client = null

/** Accept `us-east-1` or pasted console labels like `US East (N. Virginia) us-east-1`. */
export const normalizeAwsRegion = (raw) => {
    const trimmed = String(raw ?? "").trim()
    if (!trimmed) return ""
    const match = trimmed.match(AWS_REGION_PATTERN)
    return match ? match[1].toLowerCase() : trimmed
}

export const awsRegion = () => normalizeAwsRegion(process.env.AWS_REGION)

export const s3Configured = () =>
    Boolean(
        process.env.S3_BUCKET?.trim() &&
            awsRegion() &&
            (process.env.AWS_ACCESS_KEY_ID?.trim() ||
                process.env.AWS_PROFILE?.trim() ||
                process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI?.trim())
    )

export const getS3Client = () => {
    if (!s3Configured()) return null
    if (!_client) {
        _client = new S3Client({
            region: awsRegion(),
            // Avoid checksum query params on presigned URLs — browsers cannot send them.
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
            ...(process.env.AWS_ACCESS_KEY_ID?.trim() &&
            process.env.AWS_SECRET_ACCESS_KEY?.trim()
                ? {
                      credentials: {
                          accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
                          secretAccessKey:
                              process.env.AWS_SECRET_ACCESS_KEY.trim(),
                      },
                  }
                : {}),
        })
    }
    return _client
}

export const s3Bucket = () => process.env.S3_BUCKET?.trim() ?? ""

/**
 * True when gallery media should use direct HTTPS URLs (CloudFront / custom CDN).
 * Without this, clients should load files via GET /uploads/… on the API (s3UploadsMiddleware).
 */
export const s3PublicReadsViaDirectUrl = () =>
    Boolean(process.env.S3_PUBLIC_URL?.trim())

/** Build a stable S3 object key from path segments. */
export const objectKey = (...parts) =>
    parts
        .flat()
        .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
        .filter(Boolean)
        .join("/")

/** Public URL for an object (CloudFront or virtual-hosted S3). */
export const publicObjectUrl = (key) => {
    const customBase = process.env.S3_PUBLIC_URL?.trim()?.replace(/\/$/, "")
    if (customBase) return `${customBase}/${key}`
    const bucket = s3Bucket()
    const region = awsRegion()
    if (region === "us-east-1") {
        return `https://${bucket}.s3.amazonaws.com/${key}`
    }
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`
}

export const createPresignedPutUrl = async (
    key,
    { contentType, contentLength, expiresIn = DEFAULT_PRESIGN_EXPIRES_SECONDS } = {}
) => {
    const client = getS3Client()
    if (!client) throw new Error("S3 is not configured")

    const command = new PutObjectCommand({
        Bucket: s3Bucket(),
        Key: key,
        ContentType: contentType,
        // Do not bind ContentLength into the signature — browser PUT must match exactly.
    })

    const presignedUrl = await getSignedUrl(client, command, { expiresIn })
    return {
        presignedUrl,
        method: "PUT",
        headers: {
            "Content-Type": contentType,
        },
        key,
        publicUrl: publicObjectUrl(key),
        expiresIn,
    }
}

export const uploadBuffer = async (key, buffer, contentType) => {
    const client = getS3Client()
    if (!client) throw new Error("S3 is not configured")
    await client.send(
        new PutObjectCommand({
            Bucket: s3Bucket(),
            Key: key,
            Body: buffer,
            ContentType: contentType,
        })
    )
    return publicObjectUrl(key)
}

export const headObject = async (key) => {
    const client = getS3Client()
    if (!client) return null
    try {
        const result = await client.send(
            new HeadObjectCommand({ Bucket: s3Bucket(), Key: key })
        )
        return {
            contentLength: result.ContentLength ?? 0,
            contentType: result.ContentType ?? null,
        }
    } catch (err) {
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
            return null
        }
        throw err
    }
}

export const getObjectStream = async (key) => {
    const client = getS3Client()
    if (!client) throw new Error("S3 is not configured")
    const result = await client.send(
        new GetObjectCommand({ Bucket: s3Bucket(), Key: key })
    )
    return result.Body
}

export const getObjectBuffer = async (key) => {
    const stream = await getObjectStream(key)
    if (!stream) throw new Error(`S3 object not found: ${key}`)
    const chunks = []
    for await (const chunk of stream) {
        chunks.push(chunk)
    }
    return Buffer.concat(chunks)
}

export const deleteObject = async (key) => {
    const client = getS3Client()
    if (!client) return
    try {
        await client.send(
            new DeleteObjectCommand({ Bucket: s3Bucket(), Key: key })
        )
    } catch {
        /* ignore cleanup errors */
    }
}

export const deleteObjects = async (keys) => {
    const unique = [...new Set(keys.filter(Boolean))]
    await Promise.all(unique.map((key) => deleteObject(key)))
}
