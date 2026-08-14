const PAYSTACK_BASE_URL = "https://api.paystack.co"

export class PaystackError extends Error {
    constructor(message, { code, status, details } = {}) {
        super(message)
        this.name = "PaystackError"
        this.code = code
        this.status = status
        this.details = details
    }
}

export const paystackConfigured = () =>
    Boolean(process.env.PAYSTACK_SECRET_KEY?.trim())

export const paystackPublicKey = () =>
    process.env.PAYSTACK_PUBLIC_KEY?.trim() || null

const secretKey = () => process.env.PAYSTACK_SECRET_KEY?.trim()

export const paystackRequest = async (method, path, body) => {
    const apiKey = secretKey()
    if (!apiKey) {
        throw new PaystackError("Paystack is not configured", {
            code: "NOT_CONFIGURED",
        })
    }

    const response = await fetch(`${PAYSTACK_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    })

    const text = await response.text()
    let payload = null
    if (text) {
        try {
            payload = JSON.parse(text)
        } catch {
            payload = { raw: text }
        }
    }

    if (!response.ok || payload?.status === false) {
        throw new PaystackError(payload?.message || "Paystack request failed", {
            code: "PAYSTACK_ERROR",
            status: response.status,
            details: payload,
        })
    }

    return payload?.data ?? payload
}

export const createPaystackCustomer = async ({
    email,
    firstName,
    lastName,
    metadata,
}) =>
    paystackRequest("POST", "/customer", {
        email,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
        metadata,
    })

export const fetchPaystackCustomer = async (customerCodeOrId) =>
    paystackRequest("GET", `/customer/${encodeURIComponent(customerCodeOrId)}`)

export const createPaystackPlan = async ({
    name,
    amountPesewas,
    interval = "monthly",
    currency = "GHS",
    description,
}) =>
    paystackRequest("POST", "/plan", {
        name,
        amount: amountPesewas,
        interval,
        currency,
        description,
    })

export const fetchPaystackPlan = async (planCodeOrId) =>
    paystackRequest("GET", `/plan/${encodeURIComponent(planCodeOrId)}`)

export const listPaystackPlans = async ({ page = 1, perPage = 50 } = {}) =>
    paystackRequest(
        "GET",
        `/plan?page=${encodeURIComponent(page)}&perPage=${encodeURIComponent(perPage)}`
    )

export const initializePaystackSubscription = async ({
    customer,
    plan,
    metadata,
    authorization,
}) =>
    paystackRequest("POST", "/subscription", {
        customer,
        plan,
        metadata,
        authorization,
    })

/**
 * First payment / plan switch — hosted Paystack checkout.
 * Subscriptions need a reusable authorization, so prefer card (+ MoMo in GHS).
 * Bank transfer is intentionally omitted: it cannot power recurring plan charges.
 */
export const initializePaystackTransaction = async ({
    email,
    plan,
    amountPesewas,
    metadata,
    callbackUrl,
    reference,
    currency = "GHS",
    channels = ["card", "mobile_money"],
}) =>
    paystackRequest("POST", "/transaction/initialize", {
        email,
        plan,
        amount: amountPesewas,
        currency,
        metadata,
        callback_url: callbackUrl || undefined,
        reference: reference || undefined,
        channels,
    })

export const fetchPaystackSubscription = async (subscriptionCodeOrId) =>
    paystackRequest(
        "GET",
        `/subscription/${encodeURIComponent(subscriptionCodeOrId)}`
    )

export const disablePaystackSubscription = async ({ code, token }) =>
    paystackRequest("POST", "/subscription/disable", {
        code,
        token,
    })

export const verifyPaystackTransaction = async (reference) =>
    paystackRequest(
        "GET",
        `/transaction/verify/${encodeURIComponent(reference)}`
    )
