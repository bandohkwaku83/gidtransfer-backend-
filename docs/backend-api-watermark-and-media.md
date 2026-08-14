# Backend API — watermark previews, URLs, and raw media

This document describes how **watermarked previews**, **`displayUrl`**, and related settings behave in the Photo Global Express API consumed by the Next.js dashboard and client gallery.

---

## Settings model

| Field | Location | Notes |
|-------|----------|--------|
| **`watermarkPreviewEnabled`** | `User.galleryDefaults` | Studio default for **new** galleries. Toggle via `PATCH /api/settings/gallery-defaults/watermark-preview`. |
| **`watermarkPreviewEnabled`** | `Gallery` | Per-gallery override. Toggle via `PATCH /api/galleries/:id/upload-settings`. |
| **`WATERMARK_PREVIEW_TEXT`** | Server env | Optional default text composited onto preview images. Falls back to the studio **company name**, then `"Preview"`. |

Raw originals remain unmodified in storage (direct S3 PUT or local write). When preview watermarking is enabled, the upload pipeline writes companion files beside the original:

| File | Pattern | Purpose |
|------|---------|---------|
| Original | `{uuid}.jpg` | Full-quality master (`url` only — do not use for grids) |
| Thumbnail | `{uuid}-thumb.jpg` | Default on (`GALLERY_THUMB_MAX_PX`, default **800**) — progressive JPEG used by `thumbUrl` / `gridUrl` |
| Watermarked preview | `{uuid}-preview-wm.jpg` | Client full-screen preview (`displayUrl` / `viewUrl`) — progressive JPEG |

---

## `PATCH /api/galleries/:id/upload-settings` (authenticated)

Persists the per-gallery preview watermark toggle.

### Request

```json
{ "watermarkPreviewEnabled": true }
```

Also accepts `enabled`, `watermark_preview_enabled`.

### Response

Returns updated gallery detail including `watermarkPreviewEnabled`.

**Note:** Changing the toggle does **not** regenerate previews for existing uploads. Re-upload a file (or add a regeneration job) to create new watermarked derivatives.

---

## `POST /api/galleries/:id/uploads/photos` · `…/videos` — choose media type in UI

Prefer **separate** endpoints so the photographer UI can offer “Upload photos” vs “Upload videos”:

| Endpoint | Multipart field | Accepts |
|----------|-----------------|---------|
| `POST …/uploads/photos` | `photos` | Images only (JPG, PNG, WebP, GIF) — max **100MB** each |
| `POST …/uploads/videos` | `videos` | Videos only (MP4, MOV, WebM, …) — max **1TB** each |
| `POST …/uploads/photos/presign` + `…/complete` | JSON `files[]` | Images only (S3 direct upload) |
| `POST …/uploads/videos/presign` + `…/complete` | JSON `files[]` | Videos only (S3 direct upload) |

Shared options on all of the above: `applyPreviewWatermark`, `onConflict` (`skip` \| `replace` \| `cancel`), `setId`.

List filter: `GET …/uploads?mediaType=photo` or `?mediaType=video`.

Legacy mixed routes (`POST …/uploads`, `…/presign`, `…/complete`) still accept both types on field `photos` / mixed `files[]`. Optional body/query `mediaType=photo|video` narrows validation.

### Upload response (`created` / `replaced` items)

```json
{
  "id": "…",
  "originalFilename": "IMG_001.jpg",
  "url": "/uploads/gallery-photos/{galleryId}/{uuid}.jpg",
  "thumbUrl": "/uploads/gallery-photos/{galleryId}/{uuid}-thumb.jpg",
  "displayUrl": "/uploads/gallery-photos/{galleryId}/{uuid}-preview-wm.jpg",
  "mimeType": "image/jpeg",
  "isVideo": false
}
```

Videos skip image derivatives; only `url` is returned until DASH packaging finishes. Then `posterUrl`, `dashUrl`, and `dashStatus` appear — see [media-progressive-jpeg-dash.md](./media-progressive-jpeg-dash.md).

---

## Public gallery — `GET /api/public/:companySlug/:gallerySlug` or `GET /api/public/token/:shareToken`

### Gallery object

Includes:

```json
{ "watermarkPreviewEnabled": true }
```

### Photo rows (`photos`, `selections`)

When preview watermarking is enabled and derivatives exist:

```json
{
  "thumbUrl": "http://…/uploads/gallery-photos/…/uuid-thumb.jpg",
  "displayUrl": "http://…/uploads/gallery-photos/…/uuid-preview-wm.jpg",
  "url": "http://…/uploads/gallery-photos/…/uuid.jpg"
}
```

The client gallery prefers `displayUrl` for full-screen preview. When **`displayUrl` differs from `thumbUrl`**, the app uses the server watermarked file and **skips** the CSS text overlay.

When watermarking is enabled but no `displayUrl` exists yet (legacy uploads), the client may show a CSS overlay fallback in the same browser session.

---

## Delete raw photo

`DELETE /api/galleries/:id/uploads/:photoId` removes the original and any `{uuid}-thumb.jpg` / `{uuid}-preview-wm.jpg` companions.

---

## Summary

| Concern | Where |
|--------|--------|
| Studio default toggle | `PATCH /api/settings/gallery-defaults/watermark-preview` |
| Per-gallery toggle | `PATCH /api/galleries/:id/upload-settings` |
| Preview generation | `POST /api/galleries/:id/uploads` with `applyPreviewWatermark=true` |
| Client-safe URLs | Public GET — `thumbUrl`, `displayUrl`, `url` on photo rows |
| Watermark text | `WATERMARK_PREVIEW_TEXT` env or studio `companyName` |
