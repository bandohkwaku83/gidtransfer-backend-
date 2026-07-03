import User from "../models/User.js"

/** Grandfather existing email accounts created before OTP verification shipped. */
export const migrateLegacyEmailVerifiedUsers = async () => {
    const result = await User.updateMany(
        {
            authProvider: "email",
            emailVerifiedAt: null,
            $or: [
                { emailVerificationOtpHash: { $exists: false } },
                { emailVerificationOtpHash: null },
            ],
        },
        [{ $set: { emailVerifiedAt: "$createdAt" } }],
        { updatePipeline: true }
    )

    return result.modifiedCount ?? 0
}
