# Progressive JPEG + FFmpeg DASH (frontend)

Backend media delivery for faster perceived loading and adaptive video playback.

## Images — Progressive JPEG

Grid thumbnails and JPEG watermarked previews are encoded as **progressive JPEG** (mozjpeg). Browsers paint a rough full-frame early, then refine — faster perceived load.

| Env | Default | Purpose |
|-----|---------|---------|
| `GALLERY_THUMB_MAX_PX` | `1200` | Enable thumbs (set `0` to disable); min 320 when on |
| `GALLERY_THUMB_JPEG_QUALITY` | `82` | Thumb quality (faster encode + smaller files) |
| `GALLERY_PREVIEW_JPEG_QUALITY` | `90` | Watermarked preview JPEG quality |

Thumbs are always `*-thumb.jpg` (progressive), even when the original is PNG/WebP.

Original masters are **not** re-encoded.

### Client usage

Prefer `thumbUrl` for grid tiles. Fall back to `url` / `gridUrl` until `derivativesReady === true`.

---

## Video — FFmpeg MPEG-DASH

After a video upload (raws or finals), the API packages multi-bitrate **DASH** in the background and extracts a progressive JPEG **poster**.

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
| `gridUrl` | Poster when ready for videos; else original `url` |

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

Segment requests go to the same origin as `dashUrl` (`/uploads/…` or `S3_PUBLIC_URL`). Prefer a CDN (`S3_PUBLIC_URL`) for segment traffic. The API proxy sets `Access-Control-Allow-Origin: *` on `.mpd` / `.m4s` when serving from S3 via `/uploads`.
