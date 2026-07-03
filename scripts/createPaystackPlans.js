import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import {
    createPaystackPlan,
    paystackConfigured,
} from "../services/paystack.js"
import { getPaidPlans, planAmountPesewas } from "../utils/planCatalog.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true })

if (!paystackConfigured()) {
    console.error("Set PAYSTACK_SECRET_KEY in .env first.")
    process.exit(1)
}

console.log("Creating Paystack plans (monthly, GHS)...\n")

for (const plan of getPaidPlans()) {
    try {
        const created = await createPaystackPlan({
            name: `Gidtransfer ${plan.name}`,
            amountPesewas: planAmountPesewas(plan),
            description: plan.description,
        })

        const envName =
            plan.id === "starter"
                ? "PAYSTACK_PLAN_STARTER"
                : plan.id === "pro"
                  ? "PAYSTACK_PLAN_PRO"
                  : "PAYSTACK_PLAN_STUDIO"

        console.log(`${plan.name} (${plan.priceGhs} GHS/month)`)
        console.log(`  plan_code: ${created.plan_code}`)
        console.log(`  Add to .env: ${envName}=${created.plan_code}\n`)
    } catch (error) {
        console.error(`${plan.name}: ${error.message}`)
    }
}

console.log(
    "After updating .env, restart the API and set your Paystack webhook URL to:"
)
console.log("  https://YOUR_API_HOST/api/billing/webhook")
