import Gallery from "../models/Gallery.js"

/** Remove legacy null shareToken values and stale unique index. */
export async function migrateGalleryShareTokens() {
    const result = await Gallery.updateMany(
        { shareToken: null },
        { $unset: { shareToken: 1 } }
    )
    if (result.modifiedCount > 0) {
        console.log(
            `Gallery migration: cleared shareToken:null on ${result.modifiedCount} document(s)`
        )
    }

    try {
        await Gallery.collection.dropIndex("shareToken_1")
        console.log("Gallery migration: dropped legacy shareToken_1 index")
    } catch (err) {
        if (err?.codeName !== "IndexNotFound") {
            console.warn("Gallery migration: could not drop shareToken_1:", err.message)
        }
    }
}
