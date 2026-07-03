/**
 * Quick smoke test for PUT /api/galleries/:id (edit gallery details).
 * Usage: node scripts/verifyEditGallery.js
 */
const BASE = process.env.API_BASE ?? "http://127.0.0.1:7100"
const EMAIL = process.env.TEST_EMAIL ?? "you@studio.com"
const PASSWORD = process.env.TEST_PASSWORD ?? "secret12"

async function req(method, path, { token, body } = {}) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let json
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        json = { raw: text }
    }
    return { status: res.status, json }
}

async function main() {
    const login = await req("POST", "/api/auth/login", {
        body: { email: EMAIL, password: PASSWORD },
    })
    if (login.status !== 200 || !login.json?.token) {
        console.error("Login failed", login)
        process.exit(1)
    }
    const token = login.json.token

    const meta = await req("GET", "/api/galleries/meta", { token })
    console.assert(meta.status === 200, "meta endpoint")
    console.assert(
        Array.isArray(meta.json?.galleryTypes) && meta.json.galleryTypes.length > 0,
        "gallery types list"
    )
    console.assert(
        Array.isArray(meta.json?.design?.coverStyles) &&
            meta.json.design.coverStyles.length === 12,
        "cover style options"
    )
    console.assert(
        Array.isArray(meta.json?.design?.gridStyles) &&
            meta.json.design.gridStyles.length === 7,
        "grid style options"
    )
    console.assert(
        Array.isArray(meta.json?.design?.generalColors) &&
            meta.json.design.generalColors.length === 8,
        "general color presets"
    )
    console.assert(
        Array.isArray(meta.json?.design?.typography?.titleFonts) &&
            Array.isArray(meta.json?.design?.typography?.bodyFonts),
        "typography font lists"
    )

    const clientRes = await req("POST", "/api/clients", {
        token,
        body: {
            name: "Edit Gallery Test Client",
            email: `edit-gallery-${Date.now()}@example.com`,
            phone: "+233200000001",
            location: "Accra, Ghana",
        },
    })
    if (clientRes.status !== 201) {
        console.error("Create client failed", clientRes)
        process.exit(1)
    }
    const clientId = clientRes.json.client?.id ?? clientRes.json.client?._id

    const create = await req("POST", "/api/galleries", {
        token,
        body: {
            clientId,
            name: "Original Event",
            eventDate: "2026-05-18",
            galleryType: "engagement",
        },
    })
    if (create.status !== 201) {
        console.error("Create gallery failed", create)
        process.exit(1)
    }
    const galleryId = create.json.gallery.id
    console.log("created slug:", create.json.gallery.slug)

    const edit = await req("PUT", `/api/galleries/${galleryId}`, {
        token,
        body: {
            name: "Consequatur Qui qua",
            eventDate: "2026-06-05",
            description: "Outdoor ceremony coverage.",
            galleryType: "wedding",
            slug: "consequatur-qui-qua",
        },
    })
    if (edit.status !== 200) {
        console.error("Edit gallery failed", edit)
        process.exit(1)
    }
    const g = edit.json.gallery
    console.assert(g.name === "Consequatur Qui qua", "name updated")
    console.assert(g.slug === "consequatur-qui-qua", "slug updated")
    console.assert(g.galleryType === "wedding", "galleryType updated")
    console.assert(g.galleryTypeLabel === "Wedding", "galleryTypeLabel")

    const renameOnly = await req("PUT", `/api/galleries/${galleryId}`, {
        token,
        body: { name: "Renamed Title Only" },
    })
    if (renameOnly.status !== 200) {
        console.error("Rename failed", renameOnly)
        process.exit(1)
    }
    console.assert(
        renameOnly.json.gallery.slug === "consequatur-qui-qua",
        "slug preserved when only name changes"
    )

    const create2 = await req("POST", "/api/galleries", {
        token,
        body: { clientId, name: "Second Gallery", eventDate: "2026-05-19" },
    })
    const galleryId2 = create2.json.gallery.id
    const dup = await req("PUT", `/api/galleries/${galleryId2}`, {
        token,
        body: { slug: "consequatur-qui-qua" },
    })
    console.assert(dup.status === 409, "duplicate slug returns 409")

    console.log("All edit-gallery checks passed.")
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
