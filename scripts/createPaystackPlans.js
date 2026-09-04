import dotenv from "dotenv"
import path from "path"
import { fileURLToPath } from "url"
import {
    createPaystackPlan,
    fetchPaystackPlan,
    paystackConfigured,
} from "../services/paystack.js"
import {
    getPaidPlans,
    planAmountPesewas,
    paystackIntervalFor,
} from "../utils/planCatalog.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true })

if (!paystackConfigured()) {
    console.error("Set PAYSTACK_SECRET_KEY in .env first.")
    process.exit(1)
}

const variantsFor = (plan) => [
    {
        label: `${plan.name} monthly`,
        interval: "monthly",
        priceGhs: plan.priceGhs,
        envName: plan.paystackPlanCodeEnv || `PAYSTACK_PLAN_${plan.id.toUpperCase()}`,
        existingCode: plan.paystackPlanCode,
        paystackName: `Gidtransfer ${plan.name}`,
    },
    {
        label: `${plan.name} yearly`,
        interval: "yearly",
        priceGhs: plan.yearlyPriceGhs,
        envName:
            plan.paystackYearlyPlanCodeEnv ||
            `PAYSTACK_PLAN_${plan.id.toUpperCase()}_YEARLY`,
        existingCode: plan.yearlyPaystackPlanCode,
        paystackName: `Gidtransfer ${plan.name} (Yearly)`,
    },
]

/**
 * Paystack stores the charge amount on the plan object. Checkout passes plan codes
 * from .env, so stale PLN_* codes keep charging old prices even when planCatalog
 * says otherwise. This script creates fresh monthly + yearly plans at catalog prices.
 */
console.log("Creating Paystack plans (monthly + yearly, GHS)...\n")
console.log("Catalog amounts:")
for (const plan of getPaidPlans()) {
    console.log(
        `  ${plan.id}: GHS ${plan.priceGhs}/month · GHS ${plan.yearlyPriceGhs}/year`
    )
}
console.log("")

const lines = []

for (const plan of getPaidPlans()) {
    for (const variant of variantsFor(plan)) {
        const amountPesewas = planAmountPesewas({ priceGhs: variant.priceGhs })
        try {
            if (variant.existingCode) {
                try {
                    const remote = await fetchPaystackPlan(variant.existingCode)
                    const remoteGhs = Number(remote.amount) / 100
                    if (remoteGhs === variant.priceGhs) {
                        console.log(
                            `${variant.label}: already correct at GHS ${remoteGhs} (${variant.existingCode}) — keep current .env value\n`
                        )
                        continue
                    }
                    console.log(
                        `${variant.label}: existing ${variant.existingCode} is GHS ${remoteGhs} (expected ${variant.priceGhs}) — creating a new plan`
                    )
                } catch {
                    console.log(
                        `${variant.label}: could not fetch ${variant.existingCode} — creating a new plan`
                    )
                }
            }

            const created = await createPaystackPlan({
                name: variant.paystackName,
                amountPesewas,
                interval: paystackIntervalFor(variant.interval),
                description: plan.description,
            })

            console.log(`${variant.label} (GHS ${variant.priceGhs})`)
            console.log(`  plan_code: ${created.plan_code}`)
            console.log(`  Add to .env: ${variant.envName}=${created.plan_code}\n`)
            lines.push(`${variant.envName}=${created.plan_code}`)
        } catch (error) {
            console.error(`${variant.label}: ${error.message}`)
        }
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
