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
| Original | `{uuid}.jpg` | Full-quality master (`url`, `gridUrl`, `viewUrl` for photographers) |
| Thumbnail (optional) | `{uuid}-thumb.jpg` | Only when `GALLERY_THUMB_MAX_PX` is set — optional `thumbUrl` |
| Watermarked preview | `{uuid}-preview-wm.jpg` | Client full-screen preview (`displayUrl`) at full resolution |

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

## `POST /api/galleries/:id/uploads` — raw upload

Multipart fields:

| Field | Description |
|-------|-------------|
| `photos` | One or more image/video files |
| `applyPreviewWatermark` | `"true"` / `"false"` — when true, generate `{uuid}-preview-wm.jpg` using `WATERMARK_PREVIEW_TEXT` or studio name |
| `onConflict` | `skip` \| `replace` \| `cancel` |
| `setId` | Optional gallery set |

When `applyPreviewWatermark` is omitted, the server falls back to the gallery's `watermarkPreviewEnabled` value.

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

Videos skip derivative generation; only `url` is returned.

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
