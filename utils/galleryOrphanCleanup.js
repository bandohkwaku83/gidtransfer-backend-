import fs from "fs"
import path from "path"
import Gallery from "../models/Gallery.js"
import GalleryPhoto from "../models/GalleryPhoto.js"
import GalleryFinal from "../models/GalleryFinal.js"
import GallerySet from "../models/GallerySet.js"
import GalleryAnalyticsEvent from "../models/GalleryAnalyticsEvent.js"
import { GALLERY_PHOTOS_DIR } from "./galleryPhotoStorage.js"
import { GALLERY_FINALS_DIR } from "./galleryFinalStorage.js"
import {
    permanentlyDeleteGalleryFinal,
    permanentlyDeleteGalleryPhoto,
} from "./galleryTrash.js"

const removeUploadDirIfOrphaned = (baseDir, galleryId, validGalleryIds) => {
    if (validGalleryIds.has(String(galleryId))) return false
    const dir = path.join(baseDir, String(galleryId))
    if (!fs.existsSync(dir)) return false
    try {
        fs.rmSync(dir, { recursive: true, force: true })
        return true
    } catch {
        return false
    }
}

/** Remove child rows (and disk files) whose parent gallery document no longer exists. */
export async function purgeOrphanedGalleryChildren() {
    const galleryIds = await Gallery.distinct("_id")
    const validGalleryIds = new Set(galleryIds.map(String))

    const [orphanPhotos, orphanFinals, orphanSets, orphanEvents] =
        await Promise.all([
            GalleryPhoto.find({
                gallery: { $nin: galleryIds },
            }).exec(),
            GalleryFinal.find({
                gallery: { $nin: galleryIds },
            }).exec(),
            GallerySet.deleteMany({ gallery: { $nin: galleryIds } }),
            GalleryAnalyticsEvent.deleteMany({ gallery: { $nin: galleryIds } }),
        ])

    for (const photo of orphanPhotos) {
        await permanentlyDeleteGalleryPhoto(photo)
    }
    for (const final of orphanFinals) {
        await permanentlyDeleteGalleryFinal(final)
    }

    let orphanPhotoDirs = 0
    let orphanFinalDirs = 0

    if (fs.existsSync(GALLERY_PHOTOS_DIR)) {
        for (const name of fs.readdirSync(GALLERY_PHOTOS_DIR)) {
            if (removeUploadDirIfOrphaned(GALLERY_PHOTOS_DIR, name, validGalleryIds)) {
                orphanPhotoDirs += 1
            }
        }
    }

    if (fs.existsSync(GALLERY_FINALS_DIR)) {
        for (const name of fs.readdirSync(GALLERY_FINALS_DIR)) {
            if (removeUploadDirIfOrphaned(GALLERY_FINALS_DIR, name, validGalleryIds)) {
                orphanFinalDirs += 1
            }
        }
    }

    return {
        photos: orphanPhotos.length,
        finals: orphanFinals.length,
        sets: orphanSets.deletedCount ?? 0,
        analyticsEvents: orphanEvents.deletedCount ?? 0,
        orphanPhotoDirs,
        orphanFinalDirs,
    }
}
