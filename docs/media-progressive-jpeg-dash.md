# Progressive JPEG + FFmpeg DASH (frontend)

Backend media delivery for faster perceived loading and adaptive video playback.

## Images — Progressive JPEG

Grid thumbnails are **progressive JPEG** (mozjpeg). Lightbox / client previews are **WebP** at 2560px (`GALLERY_PREVIEW_MAX_PX`). Originals stay in S3 untouched.

Set `CLOUDFRONT_URL` (or `S3_PUBLIC_URL`) so browsers load thumbs and previews from CloudFront instead of proxying through the API.

| Env | Default | Purpose |
|-----|---------|---------|
| `GALLERY_THUMB_MAX_PX` | `800` | Enable thumbs (set `0` to disable); min 320 when on |
| `GALLERY_THUMB_JPEG_QUALITY` | `82` | Thumb quality (faster encode + smaller files) |
| `GALLERY_PREVIEW_MAX_PX` | `2560` | Lightbox preview (set `0` to disable); min 1600 when on |
| `GALLERY_PREVIEW_WEBP_QUALITY` | `90` | Preview WebP quality |
| `CLOUDFRONT_URL` | unset | CDN origin in front of S3 (`https://dxxxx.cloudfront.net`) |

Thumbs are always `*-thumb.jpg` (progressive). Previews are always `*-preview.webp`. Watermarked previews are `*-preview-wm.webp` (2560px), even when the original is PNG/JPEG.

Original masters are **not** re-encoded — do **not** use `url` for gallery grids or lightbox.

### Which URL to use

| UI surface | Field | Notes |
|------------|-------|-------|
| Grid / masonry tiles | **`gridUrl`** | Progressive thumb when ready; poster for video; falls back to `previewUrl` then `url` until `derivativesReady` |
| Same as grid (explicit) | `thumbUrl` | Present once the thumb exists |
| Lightbox / full view | **`viewUrl`** or `previewUrl` | 2560px WebP when ready; watermarked `displayUrl` when that setting is on |
| Download / master | `url` | Full original — never for grids or previews |

```js
// Grid tile
img.src = photo.gridUrl || photo.thumbUrl || photo.previewUrl || photo.url

// Lightbox
img.src = photo.viewUrl || photo.previewUrl || photo.displayUrl || photo.url
```

Until `derivativesReady === true`, `gridUrl` may still equal `url` — show a neutral placeholder / skeleton so the UI does not flash a giant baseline JPEG.
---

## Video — FFmpeg MPEG-DASH

After a **video** upload (`POST …/uploads/videos` or a video file on the legacy mixed route), the API packages multi-bitrate **DASH** in the background and extracts a progressive JPEG **poster**.

Requires **FFmpeg** on the API host (`ffmpeg` on `PATH`, or `FFMPEG_PATH`).

| Env | Default | Purpose |
|-----|---------|---------|
| `GALLERY_VIDEO_DASH_ENABLED` | `true` | Set `false` to disable |
| `FFMPEG_PATH` | `ffmpeg` | Binary path |
| `VIDEO_DASH_QUEUE_CONCURRENCY` | `1` | Parallel encodes |
| `GALLERY_VIDEO_DASH_MAX_BYTES` | 2 GiB | Skip packaging above this size |
| `GALLERY_VIDEO_DASH_LADDER` | `360:800,720:1800,1080:3500` | `height:kbps` rungs |
| `GALLERY_VIDEO_DASH_SEG_DURATION` | `4` | Segment length (seconds) |

### Photo / final payload fields

| Field | Meaning |
|-------|---------|
| `url` | Original master (download / non-DASH fallback) |
| `posterUrl` | Progressive JPEG poster (use as `<video poster>` / grid tile) |
| `dashUrl` | MPEG-DASH manifest (`.mpd`) for adaptive players |
| `dashStatus` | `pending` \| `processing` \| `ready` \| `failed` \| `skipped` |
| `streamingReady` | `true` when packaging finished or not applicable |
| `gridUrl` | Progressive thumb (images) or poster (videos) when ready; else `url` |

Example (ready):

```json
{
  "isVideo": true,
  "url": "https://api…/uploads/gallery-photos/{id}/{uuid}.mp4",
  "posterUrl": "https://api…/uploads/gallery-photos/{id}/{uuid}-poster.jpg",
  "dashUrl": "https://api…/uploads/gallery-photos/{id}/{uuid}-dash/manifest.mpd",
  "dashStatus": "ready",
  "streamingReady": true,
  "gridUrl": "https://api…/uploads/gallery-photos/{id}/{uuid}-poster.jpg"
}
```

### Client playback

1. Show `posterUrl` / `gridUrl` immediately while `dashStatus` is `pending` or `processing`.
2. When `dashUrl` is set and `dashStatus === "ready"`, play with a DASH player (e.g. [dash.js](https://github.com/Dash-Industry-Forum/dash.js), Shaka Player, or video.js + dash contrib).
3. If `dashStatus` is `failed` / `skipped`, fall back to progressive download of `url` (`<video src={url}>`).

```js
if (photo.dashUrl && photo.dashStatus === "ready") {
  // dash.js / shaka attach to <video>, load photo.dashUrl
} else {
  videoEl.src = photo.url
}
videoEl.poster = photo.posterUrl || ""
```

Poll gallery/list endpoints — packaging is async and does not block upload `201`.

### CORS / CDN

Segment requests go to the same origin as `dashUrl` (`/uploads/…` or `CLOUDFRONT_URL`). Prefer CloudFront (`CLOUDFRONT_URL`) for image and segment traffic. The API proxy sets `Access-Control-Allow-Origin: *` on `.mpd` / `.m4s` when serving from S3 via `/uploads`.
