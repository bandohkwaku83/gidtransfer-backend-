# Public gallery — AI selection (frontend integration)

Backend feature: **client-controlled AI suggestion runs** on the public gallery URL. Opening the gallery does **not** start analysis. The client taps Start / Pause / Resume / Terminate.

Requires `OPENAI_API_KEY` on the API server (`GALLERY_AI_SELECTION_ENABLED=true` by default when the key is set).

---

## What the backend does

1. **On upload** — thumbnails only. No AI analysis until the client starts a run.
2. **Client starts** — `POST .../ai-suggestions/start` queues unanalyzed photos (OpenAI Vision).
3. **Client can pause / resume / terminate** at any time.
4. **Suggestions** — scores quality, faces/eyes, blur; clusters near-duplicates; builds a diverse suggested set (respects `maxSelections`).
5. **Apply** — one-click heart-picks from suggestions; reject/skip still available.

---

## Run status (`aiSelection.runStatus`)

| Status | Meaning | UI |
|--------|---------|-----|
| `idle` | Not running (never started, or finished all photos) | Show **Start AI suggestions** |
| `running` | Actively analyzing | Show **Pause** + **Terminate**; poll progress |
| `paused` | Stopped mid-run; ready results kept | Show **Resume** + **Terminate** |
| `terminated` | Cancelled; suggestion badges cleared | Show **Start** again (new run) |

---

## API base

| Pattern | Example |
|---------|---------|
| Slug URL | `/api/public/:companySlug/:gallerySlug` |
| Token URL | `/api/public/token/:shareToken` |

Same password / email gate cookies as the rest of the public gallery.

---

## Gallery payload — `aiSelection`

On `GET /api/public/...` (no auto-start):

```json
{
  "aiSelection": {
    "enabled": true,
    "runStatus": "idle",
    "startedAt": null,
    "pausedAt": null,
    "terminatedAt": null,
    "ready": false,
    "readyCount": 0,
    "pendingCount": 120,
    "suggestedCount": 0,
    "queuedCount": 0
  }
}
```

| Field | Meaning |
|-------|---------|
| `enabled` | Server AI feature on |
| `runStatus` | `idle` \| `running` \| `paused` \| `terminated` |
| `ready` | All photos analyzed and at least one ready |
| `readyCount` | Photos with completed analysis |
| `pendingCount` | Not yet analyzed (or pending/processing) |
| `suggestedCount` | Photos with `ai.suggested === true` |
| `queuedCount` | Jobs waiting in the in-memory queue |

---

## Control endpoints

### Start

```
POST /api/public/:companySlug/:gallerySlug/ai-suggestions/start
POST /api/public/token/:shareToken/ai-suggestions/start
```

Sets `runStatus` to `running` and queues unanalyzed images. Safe to call again while already running (re-queues remaining work). After **terminate**, call **start** for a new run.

```json
{
  "message": "AI suggestions started",
  "queued": 48,
  "aiSelection": { "runStatus": "running", "readyCount": 0, "pendingCount": 48 }
}
```

### Pause

```
POST .../ai-suggestions/pause
```

Stops queueing more work for this gallery. In-flight jobs may finish. Keeps analyzed results and current suggestion badges.

### Resume

```
POST .../ai-suggestions/resume
```

From `paused` (or `idle` with unfinished photos) → `running` again. Returns `400` if status is `terminated` — use **start** instead.

### Terminate

```
POST .../ai-suggestions/terminate
```

Clears the queue, clears `suggested` flags, sets `runStatus` to `terminated`. Photo analysis scores already computed are kept for a faster later start.

### Get status / suggestions (read-only — does not start)

```
GET .../ai-suggestions
```

```json
{
  "aiSelection": { "runStatus": "running", "readyCount": 20, "pendingCount": 40, "suggestedCount": 8 },
  "suggestions": [ /* photo objects */ ],
  "duplicateGroups": [
    { "groupId": "...", "photoIds": ["...", "..."], "recommendedPhotoId": "..." }
  ],
  "selectionLimit": 20
}
```

### Apply suggestions (unchanged)

```
POST .../apply-ai-suggestions
{ "replaceExisting": false, "photoIds": ["optional", "subset"] }
```

### Reject / skip (unchanged)

```
POST .../reject
{ "photoId": "..." }
```

---

## Frontend integration

### Types

```typescript
type AiRunStatus = "idle" | "running" | "paused" | "terminated"

type GalleryAiSelection = {
  enabled: boolean
  runStatus: AiRunStatus
  startedAt: string | null
  pausedAt: string | null
  terminatedAt: string | null
  ready: boolean
  readyCount: number
  pendingCount: number
  suggestedCount: number
  queuedCount: number
}
```

### Control helpers

```typescript
const API = process.env.NEXT_PUBLIC_API_URL

async function aiControl(
  companySlug: string,
  gallerySlug: string,
  action: "start" | "pause" | "resume" | "terminate"
) {
  const res = await fetch(
    `${API}/api/public/${companySlug}/${gallerySlug}/ai-suggestions/${action}`,
    { method: "POST", credentials: "include" }
  )
  if (!res.ok) throw new Error((await res.json()).message)
  return res.json() as Promise<{ aiSelection: GalleryAiSelection; queued?: number }>
}

async function fetchAiSuggestions(companySlug: string, gallerySlug: string) {
  const res = await fetch(
    `${API}/api/public/${companySlug}/${gallerySlug}/ai-suggestions`,
    { credentials: "include" }
  )
  if (res.status === 503) return null
  return res.json()
}
```

### UI controls

```tsx
function AiSuggestionControls({
  ai,
  onChange,
}: {
  ai: GalleryAiSelection
  onChange: (next: GalleryAiSelection) => void
}) {
  if (!ai.enabled) return null

  const run = async (action: "start" | "pause" | "resume" | "terminate") => {
    const data = await aiControl(companySlug, gallerySlug, action)
    onChange(data.aiSelection)
  }

  return (
    <div className="ai-controls">
      {(ai.runStatus === "idle" || ai.runStatus === "terminated") && (
        <button type="button" onClick={() => run("start")}>
          Start AI suggestions
        </button>
      )}
      {ai.runStatus === "running" && (
        <>
          <button type="button" onClick={() => run("pause")}>Pause</button>
          <button type="button" onClick={() => run("terminate")}>Stop</button>
          <span>
            Analyzing… {ai.readyCount} ready
            {ai.pendingCount > 0 ? ` · ${ai.pendingCount} left` : ""}
          </span>
        </>
      )}
      {ai.runStatus === "paused" && (
        <>
          <button type="button" onClick={() => run("resume")}>Resume</button>
          <button type="button" onClick={() => run("terminate")}>Stop</button>
          <span>Paused · {ai.suggestedCount} suggestions so far</span>
        </>
      )}
    </div>
  )
}
```

### Polling (only while `running`)

```typescript
useEffect(() => {
  if (ai?.runStatus !== "running") return

  const id = setInterval(async () => {
    const data = await fetchAiSuggestions(companySlug, gallerySlug)
    if (data?.aiSelection) setAi(data.aiSelection)
    if (data?.suggestions) setSuggestions(data.suggestions)
  }, 3000)

  return () => clearInterval(id)
}, [ai?.runStatus, companySlug, gallerySlug])
```

### Suggested badge / apply / reject

Same as before — use `photo.ai?.suggested`, `POST .../apply-ai-suggestions`, `POST .../reject`. Hide suggestion UI when `runStatus === "terminated"` or `suggestedCount === 0`.

### Search / filter photos (optional OpenSearch)

```
GET .../photos/search?q=ceremony&scene=group&suggested=true&minQuality=70
```

Same password/email cookies. Returns `{ photos, pagination, search: { engine, q, filters } }`. Works with Mongo fallback when OpenSearch is off. See `docs/opensearch.md`.

---

## Suggested page layout

```text
┌──────────────────────────────────────────────────────────┐
│  Gallery title                                           │
│  [ Start AI suggestions ]   or   [ Pause ] [ Stop ]      │
│  Analyzing… 20 ready · 40 left   (only when running)     │
├──────────────────────────────────────────────────────────┤
│  Suggested picks (after start produces results)          │
│  [ Pick suggested ✨ ]                                   │
├──────────────────────────────────────────────────────────┤
│  All photos                                              │
└──────────────────────────────────────────────────────────┘
```

---

## Error handling

| Status | Meaning |
|--------|---------|
| `503` | AI disabled — hide AI controls |
| `400` | e.g. resume after terminate — call start instead |
| `403` | Selection locked (apply / reject) |

---

## Local dev

1. Set `OPENAI_API_KEY` in backend `.env`
2. Optional: `GALLERY_THUMB_MAX_PX=800`
3. Open public gallery → tap **Start AI suggestions** → poll until `ready`
4. Frontend: `NEXT_PUBLIC_API_URL=http://127.0.0.1:7100`
