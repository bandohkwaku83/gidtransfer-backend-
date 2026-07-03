/**
 * Upload the Gidtransfer email logo from your computer (no admin JWT needed).
 *
 * Usage:
 *   node scripts/uploadEmailLogo.js /path/to/logo.png
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"
import { saveBrandEmailLogo } from "../utils/brandEmailLogoStorage.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env") })

const filePath = process.argv[2]

if (!filePath) {
    console.error("Usage: node scripts/uploadEmailLogo.js <path-to-logo.png|jpg>")
    process.exit(1)
}

const resolved = path.resolve(filePath)
if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`)
    process.exit(1)
}

const ext = path.extname(resolved).toLowerCase()
const mime =
    ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null

if (!mime) {
    console.error("Logo must be PNG or JPG")
    process.exit(1)
}

const buffer = await fs.promises.readFile(resolved)
const saved = await saveBrandEmailLogo({
    buffer,
    mimetype: mime,
    size: buffer.length,
    originalname: path.basename(resolved),
})

console.log("Email logo uploaded:")
console.log(`  Path: ${saved.logoUrl}`)
console.log(`  Public URL: ${saved.logoSrc}`)
console.log("")
console.log(
    "For emails to load this logo, set API_PUBLIC_URL in .env to your public API URL in production."
)
