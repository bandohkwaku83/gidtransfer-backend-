import fs from "fs"
import path from "path"
import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GallerySet from "../models/GallerySet.js"
import { deleteGalleryCoverFile } from "./galleryCoverStorage.js"
import { deleteGalleryMusicFile } from "./galleryMusicStorage.js"
import { deleteGalleryPhotoAssets, GALLERY_PHOTOS_DIR } from "./galleryPhotoStorage.js"
import { deleteGalleryFinalFile, GALLERY_FINALS_DIR } from "./galleryFinalStorage.js"
import { clearShareCoverSnapshot } from "./galleryShareCover.js"
import { galleryOwnerFilter, galleryTrashedOnlyFilter } from "./galleryFields.js"

export const GALLERY_TRASH_RETENTION_DAYS = 30
export const GALLERY_TRASH_RETENTION_MS = GALLERY_TRASH_RETENTION_DAYS * 86_400_000

export const computeRestoreDeadline = (deletedAt = new Date()) =>
    new Date(deletedAt.getTime() + GALLERY_TRASH_RETENTION_MS)

/** Prefer stored deadline; fall back to deletedAt + retention for legacy rows. */
export const effectiveRestoreDeadline = (doc) => {
    if (doc?.restoreDeadline) return doc.restoreDeadline
    if (doc?.deletedAt) return computeRestoreDeadline(doc.deletedAt)
    return null
}

export const isRestoreExpired = (deadline) =>
    Boolean(deadline && deadline.getTime() < Date.now())

const removeDirIfEmpty = (dir) => {
    try {
        if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir)
        }
    } catch {
        /* ignore */
    }
}

/** Permanently remove a gallery and all related media (photos, finals, sets). */
export async function permanentlyDeleteGallery(galleryDoc) {
    const galleryId = String(galleryDoc._id ?? galleryDoc.id)

    if (galleryDoc.coverImageUrl) {
        deleteGalleryCoverFile(galleryDoc.coverImageUrl)
    }
    clearShareCoverSnapshot(galleryDoc)
    if (galleryDoc.backgroundMusicUrl) {
        deleteGalleryMusicFile(galleryDoc.backgroundMusicUrl)
    }

    const [photos, finals] = await Promise.all([
        GalleryPhoto.find({ gallery: galleryId })
            .select("storedFilename thumbStoredFilename previewWmStoredFilename")
            .exec(),
        GalleryFinal.find({ gallery: galleryId }).select("storedFilename").exec(),
    ])

    for (const photo of photos) {
        deleteGalleryPhotoAssets(galleryId, photo)
    }
    for (const final of finals) {
        deleteGalleryFinalFile(galleryId, final.storedFilename)
    }

    await Promise.all([
        GalleryPhoto.deleteMany({ gallery: galleryId }),
        GalleryFinal.deleteMany({ gallery: galleryId }),
        GallerySet.deleteMany({ gallery: galleryId }),
        Gallery.deleteOne({ _id: galleryId }),
    ])

    removeDirIfEmpty(path.join(GALLERY_PHOTOS_DIR, galleryId))
    removeDirIfEmpty(path.join(GALLERY_FINALS_DIR, galleryId))
}

export async function permanentlyDeleteGalleryPhoto(photoDoc) {
    const galleryId = String(photoDoc.gallery)
    deleteGalleryPhotoAssets(galleryId, photoDoc)
    await GalleryPhoto.deleteOne({ _id: photoDoc._id })
    removeDirIfEmpty(path.join(GALLERY_PHOTOS_DIR, galleryId))
}

export async function permanentlyDeleteGalleryFinal(finalDoc) {
    const galleryId = String(finalDoc.gallery)
    deleteGalleryFinalFile(galleryId, finalDoc.storedFilename)
    await GalleryFinal.deleteOne({ _id: finalDoc._id })
    removeDirIfEmpty(path.join(GALLERY_FINALS_DIR, galleryId))
}

const expiredTrashFilter = () => ({
    deletedAt: { $ne: null },
    $or: [
        { restoreDeadline: { $lte: new Date() } },
        {
            restoreDeadline: null,
            deletedAt: {
                $lte: new Date(Date.now() - GALLERY_TRASH_RETENTION_MS),
            },
        },
    ],
})

/** Remove trashed items whose restore window has passed. */
export async function purgeExpiredTrash({ ownerId } = {}) {
    const ownerPart = ownerId ? galleryOwnerFilter(ownerId) : {}
    const expired = expiredTrashFilter()

    const [expiredGalleries, expiredPhotos, expiredFinals] = await Promise.all([
        Gallery.find({ ...ownerPart, ...expired }).exec(),
        GalleryPhoto.find({ ...ownerPart, ...expired }).exec(),
        GalleryFinal.find({ ...ownerPart, ...expired }).exec(),
    ])

    for (const gallery of expiredGalleries) {
        await permanentlyDeleteGallery(gallery)
    }
    for (const photo of expiredPhotos) {
        await permanentlyDeleteGalleryPhoto(photo)
    }
    for (const final of expiredFinals) {
        await permanentlyDeleteGalleryFinal(final)
    }

    return {
        galleries: expiredGalleries.length,
        photos: expiredPhotos.length,
        finals: expiredFinals.length,
    }
}

/** Permanently delete all trashed items for an owner (empty trash). */
export async function emptyTrashForOwner(ownerId) {
    const ownerPart = galleryOwnerFilter(ownerId)
    const trashed = galleryTrashedOnlyFilter()

    const [galleries, photos, finals] = await Promise.all([
        Gallery.find({ ...ownerPart, ...trashed }).exec(),
        GalleryPhoto.find({ ...ownerPart, ...trashed }).exec(),
        GalleryFinal.find({ ...ownerPart, ...trashed }).exec(),
    ])

    for (const gallery of galleries) {
        await permanentlyDeleteGallery(gallery)
    }
    for (const photo of photos) {
        await permanentlyDeleteGalleryPhoto(photo)
    }
    for (const final of finals) {
        await permanentlyDeleteGalleryFinal(final)
    }

    return {
        galleries: galleries.length,
        photos: photos.length,
        finals: finals.length,
    }
}
