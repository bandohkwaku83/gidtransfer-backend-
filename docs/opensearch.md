# OpenSearch (optional search)

MongoDB remains the **source of truth**. OpenSearch is an optional search index for:

1. **In-gallery photo search** — filename + AI fields (`tags`, `sceneLabel`, quality, blur, suggested, …)
2. **Studio gallery list search** — name, description, client name/email, type
3. **Client list search** — name, email, phone, location

When OpenSearch is off or unreachable, the same APIs fall back to Mongo (`$regex` / filters). Response includes `search.engine`: `"opensearch"` | `"mongo"`.

---

## Enable locally

```bash
docker run -d --name opensearch -p 9200:9200 \
  -e discovery.type=single-node \
  -e DISABLE_SECURITY_PLUGIN=true \
  -e OPENSEARCH_JAVA_OPTS="-Xms512m -Xmx512m" \
  opensearchproject/opensearch:2.19.1
```

In `.env`:

```env
OPENSEARCH_ENABLED=true
OPENSEARCH_NODE=http://127.0.0.1:9200
```

Restart the API, then backfill existing rows:

```bash
node scripts/reindexOpensearch.js
```

New uploads / AI analysis / gallery+client CRUD sync into the index automatically (fire-and-forget).

---

## Photo search (studio)

```
GET /api/galleries/:id/uploads?q=ceremony&scene=group&tag=bride&suggested=true&blurry=false&eyesOpen=true&minQuality=70&page=1&limit=48
```

| Param | Meaning |
|-------|---------|
| `q` / `search` | Full-text: filename, tags, scene, suggestion reason, issues |
| `scene` | Exact `sceneLabel` (e.g. `ceremony`, `portrait`) |
| `tag` / `tags` | Comma-separated tags (all must match) |
| `suggested` | AI suggested pick |
| `blurry` / `isBlurry` | Blurry flag |
| `eyesOpen` | Eyes open |
| `selected` / `selectedByClient` | Client heart |
| `rejected` | Client reject |
| `minQuality` / `maxQuality` | Quality score range |
| `setId` | Gallery set |
| `video` | Videos only / exclude |
| `trash` | Include soft-deleted |

Without search params, list behavior is unchanged (Mongo sort by `sortOrder`).

Full (non-grid) responses include `photo.ai` when present.

---

## Photo search (public gallery)

Same query params (password / email gate cookies apply):

```
GET /api/public/:companySlug/:gallerySlug/photos/search?q=blurry&suggested=true
GET /api/public/token/:shareToken/photos/search?scene=portrait&minQuality=80
```

---

## Studio list search

Unchanged paths; OpenSearch is used when `search`/`q` is set:

```
GET /api/galleries?search=wedding
GET /api/clients?q=ama
```

---

## What is not in OpenSearch

- Progressive JPEG / DASH media delivery
- Auth, selections writes, AI queue control
- Vision analysis itself (still OpenAI → Mongo → index)

---

## Ops notes

- Indices default: `photo_global_photos`, `photo_global_galleries`, `photo_global_clients`
- Soft-delete sets `deleted: true` on gallery/photo docs; hard purge removes them
- Multi-tenant: every query filters by `ownerId` and/or `galleryId`
