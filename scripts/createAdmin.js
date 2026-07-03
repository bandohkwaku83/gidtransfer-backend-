import dotenv from "dotenv"
import mongoose from "mongoose"
import path from "path"
import Admin from "../models/Admin.js"
import { mongoUrlFromEnv } from "../utils/mongoUrlFromEnv.js"

dotenv.config({ path: path.join(process.cwd(), ".env"), override: true })

const [emailArg, passwordArg, nameArg] = process.argv.slice(2)

async function main() {
    const email = (emailArg || process.env.ADMIN_EMAIL || "").toLowerCase().trim()
    const password = passwordArg || process.env.ADMIN_PASSWORD || ""
    const name = nameArg || process.env.ADMIN_NAME || "Platform Admin"

    if (!email || !password) {
        console.error(
            "Usage: npm run create-admin -- <email> <password> [name]\n" +
                "Or set ADMIN_EMAIL and ADMIN_PASSWORD in .env"
        )
        process.exit(1)
    }

    const MONGO_URL = mongoUrlFromEnv()
    if (!MONGO_URL) {
        console.error("MONGO_URL is not set in .env")
        process.exit(1)
    }

    await mongoose.connect(MONGO_URL)

    const existing = await Admin.findOne({ email })
    if (existing) {
        console.error(`Admin already exists for ${email}`)
        process.exit(1)
    }

    const admin = await Admin.create({
        email,
        password,
        name,
        role: "superadmin",
    })

    console.log(`Created admin: ${admin.email} (${admin.name})`)
    await mongoose.disconnect()
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
