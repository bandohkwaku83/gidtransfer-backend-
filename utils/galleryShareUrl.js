import {
    buildGalleryClientPath,
    buildGalleryClientUrl,
    buildStudioUrl,
} from "./studioUrl.js"

export { buildStudioUrl, buildGalleryClientPath, buildGalleryClientUrl }

/** Client-facing share path on tenant subdomain: /client/{gallerySlug} */
export const buildGallerySharePath = (companySlug, gallerySlug) => {
    if (!companySlug || !gallerySlug) return null
    return buildGalleryClientPath(gallerySlug)
}

/** Full share URL, e.g. http://bizzles.localhost:3000/client/wedding-2024 */
export const buildGalleryShareUrl = (companySlug, gallerySlug) =>
    buildGalleryClientUrl(companySlug, gallerySlug)
