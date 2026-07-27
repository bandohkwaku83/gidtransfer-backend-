/**
 * Reindex Mongo galleries / clients / photos into OpenSearch.
 *
 * Usage:
 *   OPENSEARCH_NODE=http://127.0.0.1:9200 node scripts/reindexOpensearch.js
 *
 * Requires OPENSEARCH_ENABLED=true or OPENSEARCH_NODE set (same as the API).
 */
import dotenv from "dotenv"
import mongoose from "mongoose"
import path from "path"
import { fileURLToPath } from "url"
import { mongoUrlFromEnv } from "../utils/mongoUrlFromEnv.js"
import { mongoConnectOptions } from "../utils/mongoConnectOptions.js"
import { initOpensearch, opensearchEnabled } from "../utils/opensearch.js"
import { reindexAllGalleryPhotos } from "../utils/opensearchPhotos.js"
import {
    reindexAllStudioClients,
    reindexAllStudioGalleries,
} from "../utils/opensearchStudio.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true })

const main = async () => {
    if (!opensearchEnabled()) {
        console.error(
            "OpenSearch is disabled. Set OPENSEARCH_NODE or OPENSEARCH_ENABLED=true."
        )
        process.exit(1)
    }

    const mongoUrl = mongoUrlFromEnv()
    if (!mongoUrl) {
        console.error("MONGO_URL is not set")
        process.exit(1)
    }

    await mongoose.connect(mongoUrl, mongoConnectOptions())
    const init = await initOpensearch()
    if (!init.enabled) {
        console.error("OpenSearch init failed:", init.error)
        process.exit(1)
    }

    console.log("Reindexing galleries…")
    const galleries = await reindexAllStudioGalleries()
    console.log(`  galleries: ${galleries}`)

    console.log("Reindexing clients…")
    const clients = await reindexAllStudioClients()
    console.log(`  clients: ${clients}`)

    console.log("Reindexing photos…")
    const photos = await reindexAllGalleryPhotos()
    console.log(`  photos: ${photos}`)

    await mongoose.disconnect()
    console.log("Done.")
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
