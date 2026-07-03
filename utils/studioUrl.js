/** Client app base URL from APP_URL (e.g. http://localhost:3000). */
export const appBaseUrl = () =>
    (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "")

export const parseAppUrl = () => {
    try {
        return new URL(appBaseUrl())
    } catch {
        return new URL("http://localhost:3000")
    }
}

/** Host + port of the main app, e.g. localhost:3000 */
export const appHost = () => parseAppUrl().host

/**
 * Studio subdomain URL, e.g. http://bizzles.localhost:3000
 * Tenant slug is the first label on the app host.
 */
export const buildStudioUrl = (companySlug) => {
    const slug = companySlug?.trim().toLowerCase()
    if (!slug) return null

    const url = parseAppUrl()
    url.hostname = `${slug}.${url.hostname}`
    return url.origin
}

/** Display parts for studio URL editor in onboarding/settings. */
export const studioUrlDisplay = (companySlug) => {
    const host = appHost()
    const slug = companySlug?.trim().toLowerCase() || null

    return {
        studioUrl: slug ? buildStudioUrl(slug) : null,
        studioUrlHost: slug ? `${slug}.${host}` : null,
        /** Read-only suffix shown after the editable slug, e.g. ".localhost:3000" */
        studioUrlSuffix: `.${host}`,
        appHost: host,
    }
}

/** Client gallery path on a tenant subdomain: /client/{gallerySlug} */
export const buildGalleryClientPath = (gallerySlug) => {
    const slug = gallerySlug?.trim()
    if (!slug) return null
    return `/client/${slug}`
}

export const buildGalleryClientUrl = (companySlug, gallerySlug) => {
    const studioUrl = buildStudioUrl(companySlug)
    const path = buildGalleryClientPath(gallerySlug)
    if (!studioUrl || !path) return null
    return `${studioUrl}${path}`
}
