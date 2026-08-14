import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import {
    createPaystackPlan,
    fetchPaystackPlan,
    paystackConfigured,
} from "../services/paystack.js"
import { getPaidPlans, planAmountPesewas } from "../utils/planCatalog.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true })

if (!paystackConfigured()) {
    console.error("Set PAYSTACK_SECRET_KEY in .env first.")
    process.exit(1)
}

/**
 * Paystack stores the charge amount on the plan object. Checkout passes plan codes
 * from .env, so stale PLN_* codes keep charging old prices even when planCatalog
 * says otherwise. This script creates fresh plans at the current catalog prices.
 */
console.log("Creating Paystack plans (monthly, GHS)...\n")
console.log("Catalog amounts:")
for (const plan of getPaidPlans()) {
    console.log(
        `  ${plan.id}: GHS ${plan.priceGhs} (${planAmountPesewas(plan)} pesewas)`
    )
}
console.log("")

const lines = []

for (const plan of getPaidPlans()) {
    try {
        const existingCode = plan.paystackPlanCode
        if (existingCode) {
            try {
                const remote = await fetchPaystackPlan(existingCode)
                const remoteGhs = Number(remote.amount) / 100
                if (remoteGhs === plan.priceGhs) {
                    console.log(
                        `${plan.name}: already correct at GHS ${remoteGhs} (${existingCode}) — keep current .env value\n`
                    )
                    continue
                }
                console.log(
                    `${plan.name}: existing ${existingCode} is GHS ${remoteGhs} (expected ${plan.priceGhs}) — creating a new plan`
                )
            } catch {
                console.log(
                    `${plan.name}: could not fetch ${existingCode} — creating a new plan`
                )
            }
        }

        const created = await createPaystackPlan({
            name: `Gidtransfer ${plan.name}`,
            amountPesewas: planAmountPesewas(plan),
            description: plan.description,
        })

        const envName =
            plan.paystackPlanCodeEnv || `PAYSTACK_PLAN_${plan.id.toUpperCase()}`

        console.log(`${plan.name} (${plan.priceGhs} GHS/month)`)
        console.log(`  plan_code: ${created.plan_code}`)
        console.log(`  Add to .env: ${envName}=${created.plan_code}\n`)
        lines.push(`${envName}=${created.plan_code}`)
    } catch (error) {
        console.error(`${plan.name}: ${error.message}`)
    }
}

if (lines.length) {
    console.log("Paste into .env (replace any old PAYSTACK_PLAN_* lines):\n")
    console.log(lines.join("\n"))
    console.log("")
}

console.log(
    "After updating .env, restart the API and set your Paystack webhook URL to:"
)
console.log("  https://YOUR_API_HOST/api/billing/webhook")
