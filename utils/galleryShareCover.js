import {
    copyGalleryCoverToShareSnapshot,
    deleteGalleryCoverFile,
} from "./galleryCoverStorage.js"

/** True when the gallery has an activated share link with a cover snapshot. */
export function hasActiveShareCoverSnapshot(gallery) {
    return gallery.shareUseDefaultCover != null
}

/** Refresh the client share cover from the current admin cover. */
export async function syncShareCoverFromGalleryIfActive(gallery) {
    if (!hasActiveShareCoverSnapshot(gallery)) return
    await snapshotShareCoverFromGallery(gallery)
}

/** Freeze the current admin cover as the client share-gallery hero. */
export async function snapshotShareCoverFromGallery(gallery) {
    if (gallery.shareCoverImageUrl) {
        deleteGalleryCoverFile(gallery.shareCoverImageUrl)
    }

    const useDefault = gallery.useDefaultCover !== false
    gallery.shareUseDefaultCover = useDefault
    gallery.shareCoverFocalX = gallery.coverFocalX ?? 50
    gallery.shareCoverFocalY = gallery.coverFocalY ?? 50

    if (useDefault || !gallery.coverImageUrl) {
        gallery.shareCoverImageUrl = null
        return
    }

    gallery.shareCoverImageUrl = await copyGalleryCoverToShareSnapshot(
        String(gallery._id),
        gallery.coverImageUrl
    )
}

/** Freeze current cover accent colors for the client share gallery. */
export function snapshotShareDesignFromGallery(gallery) {
    gallery.shareCoverTextColor = gallery.coverTextColor ?? null
    gallery.shareCoverButtonColor = gallery.coverButtonColor ?? null
}

export function clearShareCoverSnapshot(gallery) {
    if (gallery.shareCoverImageUrl) {
        deleteGalleryCoverFile(gallery.shareCoverImageUrl)
    }
    gallery.shareUseDefaultCover = null
    gallery.shareCoverImageUrl = null
    gallery.shareCoverFocalX = null
    gallery.shareCoverFocalY = null
    gallery.shareCoverTextColor = null
    gallery.shareCoverButtonColor = null
}

/** Resolve cover fields for the public client gallery. */
export function resolvePublicGalleryCover(gallery) {
    const hasSnapshot = gallery.shareUseDefaultCover != null

    if (hasSnapshot) {
        const useDefault = gallery.shareUseDefaultCover === true
        return {
            coverImageUrl: useDefault ? null : gallery.shareCoverImageUrl ?? null,
            coverFocalX: gallery.shareCoverFocalX ?? 50,
            coverFocalY: gallery.shareCoverFocalY ?? 50,
        }
    }

    // Legacy galleries shared before snapshot fields existed.
    const useDefault = gallery.useDefaultCover !== false
    return {
        coverImageUrl: useDefault ? null : gallery.coverImageUrl ?? null,
        coverFocalX: gallery.coverFocalX ?? 50,
        coverFocalY: gallery.coverFocalY ?? 50,
    }
}
