# Plans & features (source of truth)

Canonical reference for **Gidtransfer** photographer plans.

Code: `utils/planCatalog.js` · `utils/planFeatures.js`  
Related: [`frontend-responsibilities.md`](./frontend-responsibilities.md) · [`admin-frontend-integration.md`](./admin-frontend-integration.md) · Gallery AI: [`public-gallery-ai-frontend.md`](./public-gallery-ai-frontend.md)

---

## Plan overview

| Id | Name | Monthly (GHS) | Yearly (GHS) | Storage | Max galleries | Video storage | Support | Highlighted |
|----|------|--------------:|-------------:|--------:|--------------:|--------------:|---------|:-----------:|
| `free` | Free | **0** (30-day trial) | — | **5 GB** | **3** | — | Contact | |
| `basic` | Basic | **32** | **380** | **25 GB** | **10** | **5 GB** | Priority | |
| `pro` | Pro | **60** | **650** | **100 GB** | **50** | **10 GB** | Priority | ✓ Most popular |
| `premium` | Premium | **120** | **1300** | **250 GB** | **Unlimited** | **20 GB** | Premium | |

Canonical ids: `free` | `basic` | `pro` | `premium`.

| Alias (legacy) | Resolves to |
|----------------|-------------|
| `starter` | `basic` |
| `business` | `pro` |
| `studio` | `premium` |

Paystack env (monthly): `PAYSTACK_PLAN_BASIC` · `PAYSTACK_PLAN_PRO` · `PAYSTACK_PLAN_PREMIUM`  
Paystack env (yearly): `PAYSTACK_PLAN_BASIC_YEARLY` · `PAYSTACK_PLAN_PRO_YEARLY` · `PAYSTACK_PLAN_PREMIUM_YEARLY`  
Fallbacks: `PAYSTACK_PLAN_STARTER` → basic · `PAYSTACK_PLAN_BUSINESS` → pro · `PAYSTACK_PLAN_STUDIO` → premium

API responses use `priceGhs` (monthly, back-compat) plus `yearlyPriceGhs` and `prices.monthly` / `prices.yearly`. Checkout accepts `interval`: `monthly` | `yearly`.

---

## Free trial rules

- Free is a **one-time 30-day trial**, not a permanent free tier.
- On signup, `subscription.trialEndsAt` = now + 30 days.
- While `trialActive`: Free features apply (3 galleries, 5 GB, core tools).
- During the trial, clients **cannot comment on or flag images**. Photographers **cannot create sets or upload videos**.
- After the trial date plus a **3-day grace**:
  - `trialExpired: true` and `viewOnly: true`
  - photographer can **view** existing work only (GET)
  - create / update / delete return `403` `SUBSCRIPTION_VIEW_ONLY`
  - billing checkout / verify stay allowed so they can subscribe
  - must upgrade to Basic / Pro / Premium (monthly or yearly)

During the 3-day grace (`inGracePeriod: true`) they keep trial features. Same grace applies after a paid period ends without renewal.

**The trial is one-time.** Subscribing, cancelling, or switching never restarts it.

| Field | Meaning |
|-------|---------|
| `trialDays` | `30` on Free; `null` on paid |
| `trialEndsAt` | When the Free trial ends |
| `trialActive` | Free plan + now &lt; `trialEndsAt` |
| `trialExpired` | Free plan + trial and 3-day grace have both ended |
| `graceDays` | Always `3` |
| `inGracePeriod` | Trial or paid period ended, grace still open |
| `viewOnly` | Grace ended — photographer can view only |
| `accessUntil` / `graceEndsAt` | Last moment of full access (period or trial end + 3 days) |

---

## Subscribe, switch, cancel (SaaS-style)

This matches typical products (Notion, Figma, etc.): you keep what you paid for until the period ends.

```
Signup → Free 30-day trial
              │
              ├─ POST /api/billing/checkout { planId, interval }  → Paystack → verify
              │         interval: "monthly" | "yearly" (default monthly)
              │         Paid plan is live immediately
              │
              ├─ POST /api/billing/checkout { otherPlanId }
              │         Switch: current plan stays on until payment succeeds,
              │         then the new plan starts and the old Paystack sub is stopped
              │
              ├─ POST /api/billing/cancel
              │         Stops renewal. Paid plan stays until currentPeriodEnd
              │         + 3-day grace (accessUntil). After that → view-only.
              │
              └─ POST /api/billing/resume
                        Undo cancel before the period ends (same plan keeps renewing)
```

| Action | What happens | Features right now |
|--------|----------------|--------------------|
| Subscribe from trial | Paystack charges the new plan | Paid features after verify |
| Switch plan | New Paystack checkout; old sub disabled after success | Current paid plan until payment lands |
| Cancel | Paystack set not to renew | **Keep paid plan until period end + 3-day grace** |
| Resume | Re-enable Paystack renewal | Still paid; `willRenew: true` again |
| Period ends, still in grace | `inGracePeriod: true` | Full access for 3 more days |
| Period + grace, not renewed | `viewOnly: true` | View existing work only |

Frontend flags on `GET /api/billing/subscription`:

- `canCancel` — show Cancel
- `canResume` — show Resume / Keep plan (cancel is pending)
- `willRenew` — next charge will happen
- `accessUntil` / `graceEndsAt` — last day of full access (period end + 3-day grace)
- `currentPeriodEnd` / `renewalDate` — billed period end / next charge
- `viewOnly` — lock writes; still allow GET + billing checkout
- `interval` — `monthly` or `yearly`
- `pendingPlanId` — checkout in progress (switch or first subscribe)

Checkout of the **same** plan while cancellation is pending calls resume automatically (no extra Paystack charge).

---

## Capability comparison (explained)

✓ = included · blank = not included

| Capability | What it means (plain language) | Free | Basic | Pro | Premium |
|------------|--------------------------------|:----:|:-----:|:---:|:-------:|
| **Storage** | How much photo/video space the studio can use | 5 GB | 25 GB | 100 GB | 250 GB |
| **Galleries** | How many client galleries can exist at once | **3** | **10** | **50** | Unlimited |
| **Client galleries** | Create a private gallery per client/shoot (upload photos & videos, cover image) | ✓ | ✓ | ✓ | ✓ |
| **Share links** | Send a public URL so the client opens proofs in the browser (optional expiry) | ✓ | ✓ | ✓ | ✓ |
| **Client selections** | Client hearts/picks favorites; photographer sees what they chose | ✓ | ✓ | ✓ | ✓ |
| **Password protection** | Gallery opens only after the client enters a password | ✓ | ✓ | ✓ | ✓ |
| **Download control** | Photographer chooses: allow downloads, previews only, or block downloads | ✓ | ✓ | ✓ | ✓ |
| **Text watermarks** | Text overlay on preview/selection thumbnails so proofs aren’t clean copies | ✓ | ✓ | ✓ | ✓ |
| **Bookings** | Calendar for shoots (client, type, time, location, fee) | ✓ | ✓ | ✓ | ✓ |
| **Booking reminders** | Automatic reminders before an upcoming shoot | ✓ | ✓ | ✓ | ✓ |
| **Client CRM** | Client list with phone, email, notes | ✓ | ✓ | ✓ | ✓ |
| **Income tracking** | Record payments and see income summaries | ✓ | ✓ | ✓ | ✓ |
| **Labels & tags** | Organize galleries/photos with types, notes, and tags | ✓ | ✓ | ✓ | ✓ |
| **Analytics dashboard** | Link opens, how many picks, selection rate | ✓ | ✓ | ✓ | ✓ |
| **Comment & flag images** | Clients can comment on photos and flag finals | | ✓ | ✓ | ✓ |
| **Sets** | Group photos into named sets within a gallery | | ✓ | ✓ | ✓ |
| **Video uploads** | Upload videos to a gallery (plan video storage cap) | | **5 GB** | **10 GB** | **20 GB** |
| **SMS notifications** | Text the client when a gallery is shared (platform default sender name) | | ✓ | ✓ | ✓ |
| **Adaptive video** | Videos stream with MPEG-DASH — quality adjusts to the client’s connection | | ✓ | ✓ | ✓ |
| **Custom SMS sender** | SMS shows **your studio name** as the sender (needs approval) | | | ✓ | ✓ |
| **Logo watermark** | Your studio **logo** is burned onto images when clients download | | | ✓ | ✓ |
| **Advanced analytics** | Extra insights: 7-day activity chart + download counts | | | ✓ | ✓ |
| **Restore from trash** | Restore soft-deleted galleries/photos within the retention window | | | ✓ | ✓ |
| **Gallery AI** | AI for photographer **and** client (see breakdown below) | | | | ✓ |

---

## Gallery AI (Premium) — detailed

Gallery AI is **not** only a photographer tool. It has two parts:

### A. Photographer side
- Generate / improve a **gallery description** with AI (helps clients understand the shoot).
- AI-assisted gallery setup where enabled in the studio app.

### B. Client side (public gallery — smart picks)
On the shared gallery link, the **client** can run AI suggestions:

1. Client taps **Start AI suggestions** (nothing runs until they start).
2. AI analyzes photos (quality, faces/eyes, blur, near-duplicates).
3. Client can **Pause / Resume / Terminate** the run.
4. AI builds a **diverse suggested set** (respects max selections).
5. Client can **apply suggestions in one tap** (heart-picks), or reject/skip individually.

So: **Premium clients can use AI to help select their favorite photos**, instead of scrolling everything manually.

Full frontend notes: [`public-gallery-ai-frontend.md`](./public-gallery-ai-frontend.md).

---

## Plan-by-plan detail

### 1. Free (`free`) — GHS 0 / 30-day trial

**Best for:** Trying the product with a few clients.

| Limit | Value |
|-------|------:|
| Price | GHS 0 (trial) |
| Storage | 5 GB |
| Galleries | **3** |
| Support | Contact |

**Includes:**
- Up to **3** client galleries
- Share links, client selections, password protection, download control
- Text watermarks
- Bookings + reminders
- Client CRM + income tracking
- Labels & tags
- Analytics dashboard (views / picks / selection rate)
- 5 GB storage

**Does not include:** Commenting or flagging images, creating sets, uploading videos, SMS, adaptive video, custom SMS sender, logo watermark, advanced analytics, Gallery AI, restore deleted galleries & photos

**Feature keys:**  
`clientGalleries`, `shareLinks`, `clientSelections`, `passwordProtectedGalleries`, `downloadControl`, `textWatermark`, `bookings`, `bookingReminders`, `clientsCrm`, `incomeTracking`, `customLabels`, `analyticsDashboard`

---

### 2. Basic (`basic`) — GHS 32 / month or GHS 380 / year

**Best for:** Active studios sharing galleries by SMS and delivering video.

| Limit | Value |
|-------|------:|
| Price | **GHS 32** / month or **GHS 380** / year |
| Storage | 25 GB |
| Galleries | **10** |
| Video storage | **5 GB** |
| Support | Priority |

**Includes everything in Free (ongoing), plus:**
- Up to **10** galleries
- **Comment & flag images**
- **Gallery sets**
- **Video uploads** (up to **5 GB**)
- **SMS notifications** when you share a gallery (platform default sender)
- **Adaptive video** (smoother playback on slow networks)
- 25 GB storage
- Priority support

**Does not include:** Custom SMS sender, logo watermark, advanced analytics, Gallery AI, restore deleted galleries & photos

**Adds:** `galleryComments`, `gallerySets`, `videoUploads`, `smsNotifications`, `videoDash`

---

### 3. Pro (`pro`) — GHS 60 / month or GHS 650 / year ★ Most popular

**Best for:** Studios that want branded downloads and deeper insights.

| Limit | Value |
|-------|------:|
| Price | **GHS 60** / month or **GHS 650** / year |
| Storage | 100 GB |
| Galleries | **50** |
| Video storage | **10 GB** |
| Support | Priority |

**Includes everything in Basic, plus:**
- Up to **50** galleries
- **Video uploads** up to **10 GB**
- **Custom SMS sender ID** — texts show your studio name
- **Logo watermark on downloads** — logo on downloaded images (not just text on previews)
- **Advanced analytics** — 7-day activity + download counts
- **Restore from trash** — restore soft-deleted galleries/photos while restore is still available
- 100 GB storage

**Does not include:** Gallery AI

**Adds:** `customSmsSender`, `customBranding`, `advancedAnalytics`, `restoreTrashItems`

---

### 4. Premium (`premium`) — GHS 120 / month or GHS 1300 / year

**Best for:** High-volume studios that want AI-assisted selection for clients.

| Limit | Value |
|-------|------:|
| Price | **GHS 120** / month or **GHS 1300** / year |
| Storage | 250 GB |
| Galleries | **Unlimited** |
| Video storage | **20 GB** |
| Support | Premium |

**Includes everything in Pro, plus:**
- **Unlimited** galleries
- **Video uploads** up to **20 GB**
- **Gallery AI** — AI descriptions for the photographer + **AI smart picks for the client** on the public gallery
- **Restore from trash** — restore soft-deleted galleries/photos while restore is still available
- 250 GB storage
- Premium support

**Adds:** `galleryAi`

---

## Feature dictionary (API keys)

| Key | Label | Plain-language explanation | Min plan |
|-----|-------|----------------------------|----------|
| `clientGalleries` | Client galleries | Create a gallery per client/shoot | Free trial |
| `shareLinks` | Share links | Public URL / token for the client to open proofs | Free trial |
| `clientSelections` | Client selections | Client hearts favorites; studio sees picks | Free trial |
| `passwordProtectedGalleries` | Password-protected galleries | Password gate before viewing | Free trial |
| `downloadControl` | Download control | Allow, limit, or block downloads per gallery | Free trial |
| `textWatermark` | Text watermarks | Text overlay on preview/selection images | Free trial |
| `bookings` | Bookings | Shoot calendar and booking records | Free trial |
| `bookingReminders` | Booking reminders | Auto reminders before a shoot | Free trial |
| `clientsCrm` | Client CRM | Client contacts and notes | Free trial |
| `incomeTracking` | Income tracking | Payments and income summaries | Free trial |
| `customLabels` | Custom labels & tags | Types, notes, photo tags | Free trial |
| `analyticsDashboard` | Analytics dashboard | Views, picks, selection rate | Free trial |
| `galleryComments` | Comment & flag images | Clients comment on photos and flag finals | **Basic** |
| `gallerySets` | Sets | Named sets within a gallery | **Basic** |
| `videoUploads` | Video uploads | Upload videos (5 GB Basic / 10 GB Pro / 20 GB Premium) | **Basic** |
| `smsNotifications` | SMS notifications | SMS when gallery is shared (default sender) | **Basic** |
| `videoDash` | Adaptive video streaming | DASH video that adapts to network speed | **Basic** |
| `customSmsSender` | Custom SMS sender ID | SMS from your studio name (approval required) | **Pro** |
| `customBranding` | Logo watermark on downloads | Logo burned onto downloaded images | **Pro** |
| `advancedAnalytics` | Advanced analytics | 7-day activity chart + download counts | **Pro** |
| `restoreTrashItems` | Restore deleted galleries & photos | Restore soft-deleted galleries/photos from your trash view (within the restore window) | **Pro** |
| `galleryAi` | Gallery AI | AI descriptions + client-run smart photo picks | **Premium** |

---

## Not plan features

| Item | Status |
|------|--------|
| Ad-free | Not a product feature |
| API access / tokens | Available to signed-in studios; not sold by plan |
| “Responsive UI” / “Free listing” | Product basics, not differentiators |

---

## Frontend implementation guide

Do **not** hardcode “if plan === pro”. Always gate from `user.plan.features` and limits from `user.plan`.

### 1. Endpoints to use

| Screen / moment | Call | Use |
|-----------------|------|-----|
| App boot / after login | `GET /api/auth/me` | `user.plan` (features, trial, storage, maxGalleries) |
| Pricing / upgrade page | `GET /api/billing/plans` | `plans`, `featureCatalog`, `comparison` |
| Billing settings | `GET /api/billing/subscription` | current status + features |
| Start checkout | `GET /api/billing/config` then `POST /api/billing/checkout` | Paystack redirect |
| After Paystack return | `GET /api/billing/verify?reference=` | then refresh `me` |
| Cancel renewal | `POST /api/billing/cancel` | keeps paid access until period end; then refresh `me` |
| Resume renewal | `POST /api/billing/resume` | undo cancel before period end |

### 2. Shape you get on `user.plan`

```ts
type PlanFeatures = {
  clientGalleries: boolean
  shareLinks: boolean
  clientSelections: boolean
  passwordProtectedGalleries: boolean
  downloadControl: boolean
  textWatermark: boolean
  bookings: boolean
  bookingReminders: boolean
  clientsCrm: boolean
  incomeTracking: boolean
  customLabels: boolean
  analyticsDashboard: boolean
  galleryComments: boolean
  gallerySets: boolean
  videoUploads: boolean
  smsNotifications: boolean
  videoDash: boolean
  customSmsSender: boolean
  customBranding: boolean
  advancedAnalytics: boolean
  restoreTrashItems: boolean
  galleryAi: boolean
}

type UserPlan = {
  planId: "free" | "basic" | "pro" | "premium"
  planName: string
  storageLimitBytes: number
  storageLabel: string
  maxGalleries: number | null // null = unlimited
  videoUploadLimitBytes: number
  videoUploadLimitLabel: string
  priceGhs: number // monthly amount, or the user's current interval amount on `user.plan`
  yearlyPriceGhs: number
  interval: "monthly" | "yearly"
  prices: {
    monthly: { interval: "monthly"; priceGhs: number; available: boolean }
    yearly: { interval: "yearly"; priceGhs: number; available: boolean }
  }
  features: PlanFeatures
  featureKeys: string[]
  supportTier: "contact" | "priority" | "premium"
  trialDays: number | null
  trialEndsAt: string | null
  trialActive: boolean
  trialExpired: boolean
  graceDays: number // 3
  graceEndsAt: string | null
  inGracePeriod: boolean
  viewOnly: boolean
  subscription: {
    status: string
    interval: "monthly" | "yearly"
    currentPeriodEnd: string | null // same as renewalDate
    renewalDate: string | null // next Paystack renewal / period end
    upgradedAt: string | null // when the studio last moved onto this paid plan
    cancelAtPeriodEnd: boolean
    pendingPlanId: string | null
    pendingInterval: "monthly" | "yearly" | null
    willRenew: boolean
    accessUntil: string | null // period or trial end + 3-day grace
    trialEndsAt: string | null
    trialActive: boolean
    trialExpired: boolean
    graceDays: number
    graceEndsAt: string | null
    inGracePeriod: boolean
    viewOnly: boolean
  }
}
```

### 3. One entitlement helper (use everywhere)

```ts
// lib/plan.ts
export function can(user: { plan?: UserPlan } | null, feature: keyof PlanFeatures) {
  return user?.plan?.features?.[feature] === true
}

export function isTrialExpired(user: { plan?: UserPlan } | null) {
  return user?.plan?.trialExpired === true
}

export function galleryLimitLabel(plan: UserPlan) {
  if (plan.maxGalleries == null) return "Unlimited"
  return String(plan.maxGalleries)
}
```

Store `user` from `/api/auth/me` in your auth store (Zustand/context/React Query). After checkout verify / cancel / settings changes that affect studio SMS, **refetch `me`**.

### 4. App shell — trial wall

```tsx
function AppGate({ user, children }) {
  if (user?.plan?.viewOnly || isTrialExpired(user)) {
    return (
      <UpgradeWall
        title="Your plan has ended"
        subtitle="You can still view existing work. Subscribe to Basic, Pro, or Premium to create or change anything."
        ctaHref="/billing"
      />
    )
  }
  return children
}
```

Show a soft banner while `trialActive`:

```tsx
{user.plan.trialActive && (
  <Banner>
    Free trial ends {formatDate(user.plan.trialEndsAt)} ·{" "}
    <Link href="/billing">Upgrade</Link>
  </Banner>
)}
```

### 5. Pricing page

```ts
const { plans, comparison, featureCatalog } = await api.get("/api/billing/plans")

// Four columns: free | basic | pro | premium
// Highlight plan where plan.highlighted === true (Pro)
// Mark current: plan.current === true
// CTA:
//   free + current → "Current plan" / "Trial active"
//   paid + available → "Upgrade"
//   paid + !available → "Coming soon" (Paystack plan code missing)
```

Render checkmarks from `comparison` (includes price, storage, galleries, feature rows). Prefer `comparison` over hardcoding the matrix.

Display both intervals: `plan.prices.monthly.priceGhs` and `plan.prices.yearly.priceGhs`. `plan.priceGhs` is the monthly amount (back-compat).

### 6. Checkout flow

Paystack takes payment immediately, but the plan only flips after the backend runs **`GET /api/billing/verify`** (or a Paystack webhook). Locally, webhooks usually cannot reach `127.0.0.1`, so **verify after return (or after re-login) is required**.

```ts
async function upgrade(
  planId: "basic" | "pro" | "premium",
  interval: "monthly" | "yearly" = "monthly"
) {
  const { configured } = await api.get("/api/billing/config")
  if (!configured) {
    toast.error("Billing is not available yet")
    return
  }

  const { checkout } = await api.post("/api/billing/checkout", { planId, interval })
  // Persist reference before redirect — needed if the session expires on the way back
  if (checkout.reference) {
    localStorage.setItem("paystackCheckoutReference", checkout.reference)
  }
  window.location.href = checkout.authorizationUrl
}

// On /billing/callback?reference=...  (Paystack may land here for success OR decline)
async function onBillingCallback(reference: string) {
  const result = await api.get(
    `/api/billing/verify?reference=${encodeURIComponent(reference)}`
  )
  await refreshMe()

  if (result.verified === true) {
    localStorage.removeItem("paystackCheckoutReference")
    router.replace("/billing?upgraded=1") // success confirmation
    return
  }

  // Decline / abandoned / failed — do NOT show upgrade success UI
  localStorage.removeItem("paystackCheckoutReference")
  router.replace(
    `/billing?payment=failed&status=${encodeURIComponent(result.status || "failed")}`
  )
}
```

**Frontend must:**

1. **Keep** the checkout reference in `localStorage` until verify finishes (do not clear it on billing page mount while subscription is still null).
2. After session expiry, **login must return** to `/billing/callback?reference=…` so verify runs — not bare `/login` / `/billing` without the reference.
3. Billing UI must **not wipe** the stored reference before reconcile.
4. Branch on verify response: `verified: true` → success confirmation; `verified: false` → decline/failed UI (never treat callback landing alone as paid).

**Verify response**

| Case | HTTP | Body |
|------|------|------|
| Success | 200 | `{ verified: true, status: "success", subscription }` |
| Declined / failed / abandoned | 200 | `{ verified: false, status: "failed"\|"abandoned"\|…, subscription }` |
| Wrong account | 403 | `{ verified: false, code: "PAYMENT_USER_MISMATCH" }` |
| Missing reference | 400 | error message |

### 6c. Renewal + upgrade dates (billing UI)

From `GET /api/auth/me` → `user.plan.subscription` (also on `GET /api/billing/subscription`):

| Field | Meaning |
|-------|---------|
| `renewalDate` / `currentPeriodEnd` | Next monthly or yearly renewal (from Paystack) |
| `interval` | `monthly` or `yearly` |
| `accessUntil` / `graceEndsAt` | Last day of full access (renewal date + 3-day grace) |
| `viewOnly` | Writes blocked; GET and billing checkout still work |
| `upgradedAt` | When the studio last upgraded onto / switched to this paid plan |

Show these on the billing settings screen after a successful upgrade.

**Backend also notifies the photographer (email + SMS):**

1. **On plan upgrade** (verify/webhook activates a new paid plan or plan switch) — confirmation email + SMS to `studio.phone`
2. **5 days before renewal** (monthly or yearly) — reminder email + SMS (scheduler; env `BILLING_RENEWAL_REMINDER_DAYS_BEFORE`, default `5`)

SMS requires `studio.phone` and Arkesel configured. Email uses the photographer account email.

### 6b. Stuck on Free after Paystack charged

**Why:** Money was taken, but verify never ran (common when the session expired on return and “Log in” dropped the `reference` query). Webhooks often cannot reach localhost, so nothing activated.

**Activate a payment already made**

1. Get the Paystack transaction reference (email/receipt or Paystack dashboard).
2. While logged in, open: `/billing/callback?reference=YOUR_REFERENCE`
3. That calls `GET /api/billing/verify` and should move the studio off Free. Then refresh `me`.

**Prod checklist (backend / env)**

| Setting | Value |
|---------|--------|
| `APP_URL` or `PAYSTACK_CALLBACK_URL` | App’s `/billing/callback` (e.g. `https://app.example.com/billing/callback`) |
| Paystack webhook URL | `https://YOUR_API/api/billing/webhook` |
| Paystack payment channels | Enable **Card** (+ **Mobile Money** for Ghana). Checkout requests `channels: ["card","mobile_money"]` — bank transfer is not used for plan subscriptions (recurring needs a card/MoMo authorization). |

### 7. Feature gates (UI map)

| Feature key | Where in the app | If false |
|-------------|------------------|----------|
| `galleryComments` | Public gallery comment / flag UI | Hide comment & flag; Upgrade to Basic+. Public GET includes `gallery.commentsEnabled` |
| `gallerySets` | Gallery → Sets (create / rename) | Hide create-set; Upgrade to Basic+. Listing remaining sets is still allowed |
| `videoUploads` | Upload videos / video finals | Hide video upload; Upgrade to Basic+. Cap is `user.plan.videoUploadLimitBytes` |
| `smsNotifications` | Share gallery → “Notify client via SMS”; SMS settings | Hide toggle / show Upgrade to Basic+ |
| `videoDash` | Video upload / player | Expect progressive MP4 only; no DASH badge |
| `customSmsSender` | Settings → SMS sender ID field | Lock field; Upgrade to Pro+. **Onboarding** may still collect `smsSenderId` without this flag (backend allows it on `POST/PUT /api/onboarding`). |
| `customBranding` | Settings → Watermark logo on downloads | Lock logo upload for burn-in; Upgrade to Pro+ |
| `advancedAnalytics` | Gallery analytics → activity series / downloads | Hide advanced charts; keep basic analytics if `analyticsDashboard` |
| `restoreTrashItems` | Trash → Restore button | Disable restore; show Upgrade to Pro+. Still allow viewing trash list (`restoreAvailable` on `GET /api/trash`) |
| `galleryAi` | Studio: generate description; Public gallery: AI suggestions | Hide AI actions; Upgrade to Premium |
| `analyticsDashboard` | Gallery analytics page | Hide analytics nav / page |

Example:

```tsx
function ShareGalleryActions({ user, onShare }) {
  const allowSms = can(user, "smsNotifications")

  return (
    <>
      <Button onClick={() => onShare({ notifyClientViaSms: false })}>
        Share link
      </Button>

      {allowSms ? (
        <Button onClick={() => onShare({ notifyClientViaSms: true })}>
          Share & SMS client
        </Button>
      ) : (
        <UpgradeHint feature="smsNotifications" required="Basic" />
      )}
    </>
  )
}

function TrashRestoreButton({ user, onRestore }) {
  if (!can(user, "restoreTrashItems")) {
    return <UpgradeHint feature="restoreTrashItems" required="Pro" />
  }
  return <Button onClick={onRestore}>Restore</Button>
}

function WatermarkLogoSettings({ user }) {
  const allowed = can(user, "customBranding")
  return (
    <LogoUploader
      disabled={!allowed}
      lockedReason={!allowed ? "Logo watermark is on Pro and Premium" : undefined}
    />
  )
}
```

### 8. Limits (galleries & storage)

```tsx
function CreateGalleryButton({ user, galleryCount }) {
  const limit = user.plan.maxGalleries // null = unlimited
  const atLimit = limit != null && galleryCount >= limit

  if (atLimit) {
    return (
      <UpgradeHint
        message={`Gallery limit reached (${limit}). Upgrade for more galleries.`}
      />
    )
  }
  return <Button href="/galleries/new">New gallery</Button>
}
```

Show usage: `3 / 10 galleries`, `12.4 GB / 25 GB` from settings overview / `user.plan`.

### 9. Handle API denials

Any gated action may return:

```json
{
  "code": "PLAN_FEATURE_REQUIRED",
  "feature": "restoreTrashItems",
  "requiredPlans": ["pro", "premium"],
  "currentPlanId": "basic",
  "trialExpired": false,
  "message": "Restore deleted galleries & photos is available on the Pro or Premium plan."
}
```

Also possible:

```json
{ "code": "GALLERY_LIMIT_REACHED", "maxGalleries": 10, "activeGalleries": 10 }
```

```json
{
  "code": "VIDEO_LIMIT_REACHED",
  "feature": "videoUploads",
  "videoUsedBytes": 5368709120,
  "videoUploadLimitBytes": 5368709120,
  "message": "Video storage limit reached (5 GB on this plan). Upgrade for more video space."
}
```

Global API client:

```ts
if (error.code === "PLAN_FEATURE_REQUIRED") {
  openUpgradeModal({
    feature: error.feature,
    requiredPlans: error.requiredPlans,
    trialExpired: error.trialExpired,
  })
}
```

### 10. Trash endpoints

```
GET    /api/trash              → list + restoreAvailable
POST   /api/trash/restore      → { galleryIds?, photoIds? }  // Pro+
DELETE /api/trash              → empty trash
```

```ts
const trash = await api.get("/api/trash")
// trash.restoreAvailable === false → show upgrade on Restore
// trash.galleries[].restoreExpired → disable that row
```

### 11. SMS config

```
GET /api/sms/config
→ { available, customSenderAvailable, studio, upgrade? }
```

- `available` → `smsNotifications` (Basic+)
- `customSenderAvailable` → `customSmsSender` (Pro+)

### 12. Minimal checklist for FE

1. Persist `user.plan` from `/me` after every auth success.
2. Build `can(user, feature)` — never branch on plan name for product features.
3. Trial expired → hard upgrade wall for create/upload flows.
4. Pricing page driven by `/api/billing/plans` (+ `comparison`).
5. Checkout → persist Paystack `reference` → Paystack → `/billing/callback?reference=` → verify → refresh `me` (survives session expiry / re-login).
6. Gate: comments/flags, sets, video uploads, SMS, video DASH UX, custom sender, logo watermark, advanced analytics, trash restore, Gallery AI.
7. Enforce gallery/storage/video limits in create/upload CTAs.
8. Map `PLAN_FEATURE_REQUIRED` / `GALLERY_LIMIT_REACHED` / `VIDEO_LIMIT_REACHED` / `SUBSCRIPTION_VIEW_ONLY` to upgrade UI. When `viewOnly` is true, keep list/detail screens readable and send all create/edit actions to billing.

**Storage meters (`GET /api/storage`):** `summary.usedBytes` is **photos/finals only** (plan pool). `summary.videoUsedBytes` + `summary.videoUploadLimitBytes` are the separate video pool. Refresh storage after uploads so the video bar fills.

---

## Checkout API summary

```
GET  /api/billing/config
POST /api/billing/checkout   { "planId": "basic" | "pro" | "premium", "interval": "monthly" | "yearly" }
GET  /api/billing/verify?reference=
POST /api/billing/cancel
POST /api/billing/resume
GET  /api/billing/subscription
GET  /api/billing/plans
```

Re-create Paystack plans after price changes: `node scripts/createPaystackPlans.js`

```env
APP_URL=https://your-app.example.com
# Optional override (default: APP_URL/billing/callback)
# PAYSTACK_CALLBACK_URL=https://your-app.example.com/billing/callback

PAYSTACK_PLAN_BASIC=
PAYSTACK_PLAN_PRO=
PAYSTACK_PLAN_PREMIUM=
PAYSTACK_PLAN_BASIC_YEARLY=
PAYSTACK_PLAN_PRO_YEARLY=
PAYSTACK_PLAN_PREMIUM_YEARLY=
```

Paystack dashboard webhook: `POST https://YOUR_API/api/billing/webhook` (needed in prod; local tunnels rarely receive these).
