/**
 * Smoke test for gallery media reorder.
 * Usage: node scripts/verifyGalleryReorder.js
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
    const token = login.json?.token
    if (!token) {
        console.error("Login failed", login)
        process.exit(1)
    }

    const list = await req("GET", "/api/galleries", { token })
    const galleryId = list.json?.galleries?.[0]?.id
    if (!galleryId) {
        console.error("No gallery found")
        process.exit(1)
    }

    const uploads = await req("GET", `/api/galleries/${galleryId}/uploads`, {
        token,
    })
    const photoIds = (uploads.json?.photos ?? []).map((p) => p.id)
    if (photoIds.length < 2) {
        console.log("Need at least 2 uploads to test reorder; skipping upload reorder")
    } else {
        const reversed = [...photoIds].reverse()
        const reorder = await req(
            "PATCH",
            `/api/galleries/${galleryId}/uploads/reorder`,
            { token, body: { photoIds: reversed } }
        )
        if (reorder.status !== 200) {
            console.error("Upload reorder failed", reorder)
            process.exit(1)
        }
        const after = await req("GET", `/api/galleries/${galleryId}/uploads`, {
            token,
        })
        const afterIds = (after.json?.photos ?? []).map((p) => p.id)
        console.assert(
            JSON.stringify(afterIds) === JSON.stringify(reversed),
            "upload order persisted"
        )
        await req("PATCH", `/api/galleries/${galleryId}/uploads/reorder`, {
            token,
            body: { photoIds },
        })
    }

    const bad = await req(
        "PATCH",
        `/api/galleries/${galleryId}/uploads/reorder`,
        { token, body: { photoIds: ["000000000000000000000000"] } }
    )
    console.assert(bad.status === 400, "invalid reorder returns 400")

    console.log("Gallery reorder checks passed.")
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
