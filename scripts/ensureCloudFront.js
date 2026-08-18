/**
 * Create (or reuse) a CloudFront distribution in front of the gallery S3 bucket.
 *
 * Usage:
 *   node scripts/ensureCloudFront.js
 *
 * Writes CLOUDFRONT_URL into .env when a distribution domain is available.
 * Gallery originals stay in S3; browsers load cached copies from the CDN.
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import {
    CloudFrontClient,
    CreateDistributionCommand,
    CreateOriginAccessControlCommand,
    ListDistributionsCommand,
    ListOriginAccessControlsCommand,
} from "@aws-sdk/client-cloudfront"
import {
    GetBucketPolicyCommand,
    PutBucketPolicyCommand,
} from "@aws-sdk/client-s3"
import {
    awsRegion,
    getS3Client,
    s3Bucket,
    s3Configured,
} from "../utils/s3Storage.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, "..", ".env")
dotenv.config({ path: envPath, override: true })

const OAC_NAME = "gidtransfer-gallery-s3-oac"
const DISTRIBUTION_COMMENT = "Gidtransfer gallery media CDN"
const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6"
const CORS_S3_ORIGIN_POLICY_ID = "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf"

const s3OriginDomain = (bucket, region) =>
    region === "us-east-1"
        ? `${bucket}.s3.amazonaws.com`
        : `${bucket}.s3.${region}.amazonaws.com`

const upsertEnvVar = (fileText, key, value) => {
    const line = `${key}=${value}`
    const pattern = new RegExp(`^${key}=.*$`, "m")
    if (pattern.test(fileText)) {
        return fileText.replace(pattern, line)
    }
    const trimmed = fileText.replace(/\s*$/, "")
    return `${trimmed}\n\n${line}\n`
}

const writeCloudFrontUrl = (domain) => {
    const url = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
    let envText = ""
    try {
        envText = fs.readFileSync(envPath, "utf8")
    } catch {
        envText = ""
    }
    envText = upsertEnvVar(envText, "CLOUDFRONT_URL", url)
    fs.writeFileSync(envPath, envText)
    return url
}

const findExistingOac = async (cf) => {
    let marker
    do {
        const listed = await cf.send(
            new ListOriginAccessControlsCommand({ Marker: marker })
        )
        const items =
            listed.OriginAccessControlList?.Items ?? []
        const match = items.find((item) => item.Name === OAC_NAME)
        if (match?.Id) return match.Id
        marker = listed.OriginAccessControlList?.IsTruncated
            ? listed.OriginAccessControlList.NextMarker
            : undefined
    } while (marker)
    return null
}

const ensureOac = async (cf) => {
    const existing = await findExistingOac(cf)
    if (existing) return existing

    const created = await cf.send(
        new CreateOriginAccessControlCommand({
            OriginAccessControlConfig: {
                Name: OAC_NAME,
                Description: "Read-only OAC for Gidtransfer gallery media",
                SigningProtocol: "sigv4",
                SigningBehavior: "always",
                OriginAccessControlOriginType: "s3",
            },
        })
    )
    const id = created.OriginAccessControl?.Id
    if (!id) throw new Error("CloudFront OAC was created without an id")
    return id
}

const findExistingDistribution = async (cf, originDomain) => {
    let marker
    do {
        const listed = await cf.send(
            new ListDistributionsCommand({ Marker: marker })
        )
        const items = listed.DistributionList?.Items ?? []
        const match = items.find((dist) =>
            (dist.Origins?.Items ?? []).some(
                (origin) => origin.DomainName === originDomain
            )
        )
        if (match) return match
        marker = listed.DistributionList?.IsTruncated
            ? listed.DistributionList.NextMarker
            : undefined
    } while (marker)
    return null
}

const createDistribution = async (cf, { originDomain, oacId, bucket }) => {
    const result = await cf.send(
        new CreateDistributionCommand({
            DistributionConfig: {
                CallerReference: `gidtransfer-gallery-${Date.now()}`,
                Comment: DISTRIBUTION_COMMENT,
                Enabled: true,
                HttpVersion: "http2and3",
                PriceClass: "PriceClass_All",
                Origins: {
                    Quantity: 1,
                    Items: [
                        {
                            Id: `${bucket}-s3`,
                            DomainName: originDomain,
                            OriginPath: "",
                            S3OriginConfig: {
                                OriginAccessIdentity: "",
                            },
                            OriginAccessControlId: oacId,
                        },
                    ],
                },
                DefaultCacheBehavior: {
                    TargetOriginId: `${bucket}-s3`,
                    ViewerProtocolPolicy: "redirect-to-https",
                    AllowedMethods: {
                        Quantity: 3,
                        Items: ["GET", "HEAD", "OPTIONS"],
                        CachedMethods: {
                            Quantity: 2,
                            Items: ["GET", "HEAD"],
                        },
                    },
                    Compress: true,
                    CachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
                    OriginRequestPolicyId: CORS_S3_ORIGIN_POLICY_ID,
                    SmoothStreaming: false,
                    FieldLevelEncryptionId: "",
                    TrustedSigners: { Enabled: false, Quantity: 0 },
                },
                Restrictions: {
                    GeoRestriction: {
                        RestrictionType: "none",
                        Quantity: 0,
                    },
                },
                ViewerCertificate: {
                    CloudFrontDefaultCertificate: true,
                    MinimumProtocolVersion: "TLSv1.2_2021",
                },
            },
        })
    )
    return result.Distribution
}

const allowCloudFrontRead = async (s3, { bucket, distributionArn }) => {
    let policy = { Version: "2012-10-17", Statement: [] }
    try {
        const existing = await s3.send(
            new GetBucketPolicyCommand({ Bucket: bucket })
        )
        if (existing.Policy) {
            policy = JSON.parse(existing.Policy)
            if (!Array.isArray(policy.Statement)) {
                policy.Statement = policy.Statement ? [policy.Statement] : []
            }
        }
    } catch (err) {
        if (err.name !== "NoSuchBucketPolicy" && err.$metadata?.httpStatusCode !== 404) {
            throw err
        }
    }

    const sid = "AllowCloudFrontReadGidtransferGallery"
    policy.Statement = policy.Statement.filter((stmt) => stmt.Sid !== sid)
    policy.Statement.push({
        Sid: sid,
        Effect: "Allow",
        Principal: { Service: "cloudfront.amazonaws.com" },
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${bucket}/*`,
        Condition: {
            StringEquals: {
                "AWS:SourceArn": distributionArn,
            },
        },
    })

    await s3.send(
        new PutBucketPolicyCommand({
            Bucket: bucket,
            Policy: JSON.stringify(policy),
        })
    )
}

const main = async () => {
    if (!s3Configured()) {
        console.error("S3 is not configured. Set S3_BUCKET, AWS_REGION, and credentials.")
        process.exit(1)
    }

    const bucket = s3Bucket()
    const region = awsRegion()
    const originDomain = s3OriginDomain(bucket, region)
    const cf = new CloudFrontClient({ region: "us-east-1" })
    const s3 = getS3Client()

    console.log(`S3 origin: ${originDomain}`)

    const existing = await findExistingDistribution(cf, originDomain)
    let distribution = existing

    if (distribution) {
        console.log(
            `Reusing CloudFront distribution ${distribution.Id} (${distribution.DomainName})`
        )
    } else {
        console.log("Creating Origin Access Control…")
        const oacId = await ensureOac(cf)
        console.log("Creating CloudFront distribution (this can take a few minutes)…")
        distribution = await createDistribution(cf, {
            originDomain,
            oacId,
            bucket,
        })
        console.log(
            `Created ${distribution.Id} — status ${distribution.Status} (${distribution.DomainName})`
        )
        console.log(
            "CloudFront needs 5–15 minutes to deploy. Images start serving once status is Deployed."
        )
    }

    const arn = distribution.ARN
    const domain = distribution.DomainName
    if (!arn || !domain) {
        throw new Error("CloudFront distribution is missing ARN or domain")
    }

    console.log("Allowing CloudFront to read from the S3 bucket…")
    await allowCloudFrontRead(s3, { bucket, distributionArn: arn })

    const url = writeCloudFrontUrl(domain)
    console.log(`CLOUDFRONT_URL=${url}`)
    console.log("Restart the API so gallery URLs use the CDN.")
}

main().catch((err) => {
    console.error(err)
    if (err.Code === "AccessDenied" || err.name === "AccessDenied") {
        console.error(`
The current AWS user can write to S3 but cannot manage CloudFront.

Attach a policy that allows:
  cloudfront:ListDistributions
  cloudfront:CreateDistribution
  cloudfront:GetDistribution
  cloudfront:CreateOriginAccessControl
  cloudfront:ListOriginAccessControls
  s3:GetBucketPolicy
  s3:PutBucketPolicy

Then re-run: npm run ensure-cloudfront

Until then, Sharp still writes high-quality WebP previews in S3. After the distribution
exists, set CLOUDFRONT_URL=https://dxxxx.cloudfront.net and restart the API.
`)
    }
    process.exit(1)
})
