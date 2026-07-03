import { parseAmountCharged } from "./bookingFields.js"

export const isTruthyInput = (raw) =>
    raw === true || raw === "true" || raw === 1 || raw === "1"

export const readOutstandingBalanceRaw = (body) =>
    body?.outstandingBalanceGhs ??
    body?.outstanding_balance_ghs ??
    body?.amountOwing ??
    body?.amount_owing ??
    body?.balance

export const parseOutstandingBalanceGhs = (
    raw,
    { required = false, requiredMessage } = {}
) => {
    if (raw === undefined || raw === null || raw === "") {
        if (required) {
            return {
                error:
                    requiredMessage ??
                    "Amount owing (GHS) is required when locking a final",
            }
        }
        return { value: undefined }
    }

    const parsed = parseAmountCharged(raw)
    if (parsed.error) {
        return {
            error: parsed.error.replace(
                "Amount charged",
                "Amount owing (GHS)"
            ),
        }
    }

    return { value: parsed.value }
}

/** Payment gate fields when uploading new finals. */
export const resolveGalleryFinalUploadPayment = (body) => {
    const clientPaidRaw =
        body?.clientPaid ?? body?.client_paid ?? "true"
    const clientPaid = isTruthyInput(clientPaidRaw)

    let outstandingBalanceGhs = null
    let isLocked = false

    if (!clientPaid) {
        const balanceParsed = parseOutstandingBalanceGhs(
            readOutstandingBalanceRaw(body),
            {
                required: true,
                requiredMessage:
                    "Amount owing (GHS) is required when client has not paid",
            }
        )
        if (balanceParsed.error) {
            return { error: balanceParsed.error }
        }
        outstandingBalanceGhs = balanceParsed.value

        const lockRaw =
            body?.lockPreviews ??
            body?.lock_previews ??
            body?.isLocked ??
            body?.is_locked ??
            "true"
        isLocked = isTruthyInput(lockRaw)
    }

    return { clientPaid, outstandingBalanceGhs, isLocked }
}

/** Lock/unlock an existing final. */
export const resolveGalleryFinalLockUpdate = (body, existingRow = {}) => {
    const isLockedRaw =
        body?.isLocked ??
        body?.is_locked ??
        body?.lockPreviews ??
        body?.lock_previews

    if (isLockedRaw === undefined) {
        return { error: "isLocked is required" }
    }

    const isLocked = isTruthyInput(isLockedRaw)

    if (isLocked) {
        const balanceRaw = readOutstandingBalanceRaw(body)
        const balanceParsed = parseOutstandingBalanceGhs(
            balanceRaw !== undefined
                ? balanceRaw
                : existingRow.outstandingBalanceGhs,
            { required: balanceRaw === undefined && existingRow.outstandingBalanceGhs == null }
        )
        if (balanceParsed.error) {
            return { error: balanceParsed.error }
        }

        return {
            isLocked: true,
            outstandingBalanceGhs: balanceParsed.value,
            clientPaid: false,
        }
    }

    const clientPaidRaw = body?.clientPaid ?? body?.client_paid
    const clientPaid =
        clientPaidRaw === undefined ? true : isTruthyInput(clientPaidRaw)

    return {
        isLocked: false,
        outstandingBalanceGhs: null,
        clientPaid,
    }
}
