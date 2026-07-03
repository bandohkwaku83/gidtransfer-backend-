import Counter from "../models/Counter.js"
import User from "../models/User.js"

const COUNTER_ID = "accountId"
/** First issued id is gt1001 (counter starts at 1000, then increments). */
const ACCOUNT_ID_START = 1000

export const formatAccountId = (seq) => `gt${seq}`

export const initAccountIdCounter = async () => {
    await Counter.updateOne(
        { _id: COUNTER_ID },
        { $setOnInsert: { seq: ACCOUNT_ID_START } },
        { upsert: true }
    )
}

export const nextAccountId = async () => {
    const counter = await Counter.findOneAndUpdate(
        { _id: COUNTER_ID },
        { $inc: { seq: 1 } },
        { returnDocument: "after" }
    )
    if (!counter) {
        await initAccountIdCounter()
        return nextAccountId()
    }
    return formatAccountId(counter.seq)
}

export const ensureUserAccountId = async (user) => {
    if (user.accountId?.trim()) return user.accountId

    const accountId = await nextAccountId()
    user.accountId = accountId
    await user.save()
    return accountId
}

export const migrateMissingAccountIds = async () => {
    const users = await User.find({
        $or: [{ accountId: { $exists: false } }, { accountId: "" }],
    }).select("_id accountId")

    let migrated = 0
    for (const user of users) {
        user.accountId = await nextAccountId()
        await user.save()
        migrated += 1
    }

    return migrated
}
