# Admin frontend integration

Guide for the **separate admin Next.js app** (platform staff). Talks only to `/api/admin/*` with an admin JWT.

Related:

- Ownership split: [`frontend-responsibilities.md`](./frontend-responsibilities.md)
- Photographer billing / features: [`billing-plans-frontend.md`](./billing-plans-frontend.md)
- Env template: [`env.admin-frontend.example`](./env.admin-frontend.example)
- Postman: collection folder **Admin** (includes Examples)

---

## Setup

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:7100
# Production: https://api.gidtransfer.com
```

| Concern | Rule |
|---------|------|
| Auth header | `Authorization: Bearer <adminToken>` on every route except login |
| Token kind | Admin JWT only (`kind: "admin"`). Photographer tokens get `401` |
| Content-Type | `application/json` for POST/PATCH/PUT/DELETE bodies |
| Dates | ISO-8601 strings from the API |
| Pagination | Most lists: `{ page, limit, total, totalPages, hasMore }` |

### Suggested client helper

```ts
const API = process.env.NEXT_PUBLIC_API_URL

async function adminFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("adminToken") // or your store
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.message || res.statusText), { status: res.status, data })
  return data
}
```

---

## Suggested screens

| Screen | Primary endpoints |
|--------|-------------------|
| Login | `POST /auth/login` |
| Dashboard | `GET /stats` |
| Photographers | `GET /photographers`, detail + activate/deactivate/verify |
| Gallery inspector | `GET /galleries`, `GET /galleries/:id`, share actions |
| Moderation | `GET /moderation/flagged-finals` |
| Trash | `GET /trash`, purge / restore |
| CRM | `GET /crm/studios`, `GET /crm/bookings` |
| Messaging | `POST /communications/sms\|email`, history |
| Billing | `GET/PATCH /billing/plans`, overrides, events |
| Support inbox | `GET /issue-reports` |
| SMS sender IDs | `GET /sms/sender-ids` |

All paths below are under **`{NEXT_PUBLIC_API_URL}/api/admin`**.

---

## Auth

### `POST /auth/login`

No bearer token.

**Body**

```json
{ "email": "admin@example.com", "password": "••••••••" }
```

**Sample response `200`**

```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
  "admin": {
    "_id": "665f0a1b2c3d4e5f67890001",
    "email": "admin@example.com",
    "name": "Platform Admin",
    "role": "admin",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**UI:** store `token` as `adminToken`. Show `admin.name` / `admin.email` in the shell. Roles today: `admin` | `superadmin` (same permissions unless you add checks later).

### `GET /auth/me`

**Sample response `200`**

```json
{
  "admin": {
    "_id": "665f0a1b2c3d4e5f67890001",
    "email": "admin@example.com",
    "name": "Platform Admin",
    "role": "admin",
    "isActive": true
  }
}
```

---

## Dashboard

### `GET /stats`

**Sample response `200`**

```json
{
  "photographers": {
    "total": 128,
    "onboarded": 96,
    "notOnboarded": 32,
    "emailVerified": 110,
    "emailUnverified": 18,
    "active": 120,
    "inactive": 8,
    "byPlan": { "free": 80, "starter": 20, "pro": 18, "studio": 10 },
    "bySubscriptionStatus": {
      "free": 80,
      "active": 40,
      "past_due": 5,
      "pending": 3
    },
    "bySmsSenderStatus": {
      "none": 40,
      "approved": 70,
      "pending": 10,
      "rejected": 8
    },
    "byAuthProvider": { "email": 100, "google": 28 },
    "pendingSmsSenders": 10
  },
  "clients": { "total": 1540 },
  "galleries": {
    "active": 890,
    "trashed": 42,
    "byStatus": { "draft": 120, "selecting": 400, "done": 370 }
  },
  "support": { "openIssueReports": 7 }
}
```

**UI cards:** photographers total / active, open issues, pending SMS senders, active galleries, clients total. Charts: `byPlan`, `byStatus`.

---

## Photographers

### `GET /photographers`

**Query:** `onboarded`, `emailVerified`, `isActive`, `planId`, `subscriptionStatus`, `smsSenderStatus`, `search`, `sort` (`lastLoginAt` | `createdAt` | …), `order` (`asc`|`desc`), `page`, `limit`

**Sample response `200`**

```json
{
  "items": [
    {
      "userId": "665f0a1b2c3d4e5f67890123",
      "accountId": "GT-10042",
      "email": "studio@example.com",
      "emailVerified": true,
      "authProvider": "email",
      "isActive": true,
      "agreedToTermsAt": "2026-02-01T12:00:00.000Z",
      "onboardingComplete": true,
      "onboardingCompletedAt": "2026-02-02T09:00:00.000Z",
      "companyName": "Bizzles Photography",
      "companySlug": "bizzles",
      "country": "GH",
      "phone": "+233241234567",
      "primaryDeliverable": "photos",
      "smsSenderId": "BIZZLES",
      "smsSenderStatus": "approved",
      "planId": "pro",
      "planName": "Pro",
      "subscriptionStatus": "active",
      "activity": {
        "lastLoginAt": "2026-07-27T18:00:00.000Z",
        "lastSeenAt": "2026-07-27T19:10:00.000Z",
        "loginCount": 42,
        "activeSessions": 1,
        "latestSession": {
          "id": "665f0a1b2c3d4e5f6789sess",
          "createdAt": "2026-07-27T18:00:00.000Z",
          "lastSeenAt": "2026-07-27T19:10:00.000Z",
          "ip": "127.0.0.1",
          "userAgent": "Mozilla/5.0"
        }
      },
      "createdAt": "2026-02-01T12:00:00.000Z",
      "updatedAt": "2026-07-27T19:10:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 128,
    "totalPages": 3,
    "hasMore": true
  }
}
```

**UI table columns:** company, email, plan badge, status (`isActive`), SMS status, last login, actions → detail.

### `GET /photographers/:userId?sessionLimit=10`

**Sample response `200`**

```json
{
  "photographer": {
    "id": "665f0a1b2c3d4e5f67890123",
    "email": "studio@example.com",
    "emailVerified": true,
    "onboardingComplete": true,
    "onboardingCompletedAt": "2026-02-02T09:00:00.000Z",
    "agreedToTermsAt": "2026-02-01T12:00:00.000Z",
    "companyLogo": null,
    "studio": {
      "companyName": "Bizzles Photography",
      "companySlug": "bizzles",
      "phone": "+233241234567",
      "companyLogo": null
    },
    "activity": {
      "lastLoginAt": "2026-07-27T18:00:00.000Z",
      "lastSeenAt": "2026-07-27T19:10:00.000Z",
      "loginCount": 42,
      "activeSessions": 1,
      "tokenVersion": 3
    },
    "subscription": {
      "planId": "pro",
      "planName": "Pro",
      "storageLimitBytes": 107374182400,
      "storageLabel": "100 GB",
      "maxGalleries": null,
      "perks": ["100 GB storage", "Unlimited galleries", "Priority support"],
      "priceGhs": 199,
      "interval": "monthly",
      "status": "active",
      "currentPeriodEnd": "2026-08-28T00:00:00.000Z",
      "cancelAtPeriodEnd": false,
      "pendingPlanId": null,
      "paystackSubscriptionCode": "SUB_sample",
      "paystackCustomerCode": "CUS_sample",
      "canManage": true,
      "limitOverride": null
    },
    "usage": {
      "clientCount": 48,
      "galleries": {
        "all": 12,
        "draft": 2,
        "selecting": 5,
        "done": 5,
        "trash": 1
      },
      "storageBytes": 53687091200,
      "storageLabel": "50 GB",
      "storageLimitBytes": 107374182400,
      "storageLimitLabel": "100 GB",
      "maxGalleries": null
    },
    "recentSessions": []
  }
}
```

**UI:** usage meters (`storageBytes` / `storageLimitBytes`), gallery status chips from `usage.galleries`, plan + override banner if `limitOverride` is set.

### `GET /photographers/:userId/sessions?active=true&page=&limit=`

**Sample response `200`**

```json
{
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789sess",
      "createdAt": "2026-07-27T18:00:00.000Z",
      "lastSeenAt": "2026-07-27T19:10:00.000Z",
      "endedAt": null,
      "endReason": null,
      "ip": "127.0.0.1",
      "userAgent": "Mozilla/5.0",
      "authMethod": "email",
      "active": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

### `PATCH /photographers/:userId/activate` · `…/deactivate`

**Sample `200` (activate)**

```json
{
  "message": "Photographer activated",
  "user": { "id": "665f0a1b2c3d4e5f67890123", "email": "studio@example.com", "isActive": true }
}
```

### `POST /photographers/:userId/verify-email`

**Sample `200`**

```json
{
  "message": "Email marked as verified",
  "user": { "id": "665f0a1b2c3d4e5f67890123", "emailVerified": true }
}
```

### `GET /photographers/:userId/galleries?status=&trashOnly=&page=&limit=`

**Sample `200`**

```json
{
  "photographer": {
    "userId": "665f0a1b2c3d4e5f67890123",
    "email": "studio@example.com",
    "companyName": "Bizzles Photography",
    "companySlug": "bizzles",
    "isActive": true
  },
  "counts": { "all": 12, "draft": 2, "selecting": 5, "done": 5, "trash": 1 },
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789abcd",
      "name": "Ama & Kojo Wedding",
      "slug": "ama-kojo-wedding",
      "status": "selecting",
      "eventDate": "2026-06-14T12:00:00.000Z",
      "galleryType": "wedding",
      "galleryTypeLabel": "Wedding",
      "client": { "id": "665f0a1b2c3d4e5f6789client", "name": "Ama Mensah" },
      "studio": {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "companyName": "Bizzles Photography",
        "companySlug": "bizzles"
      },
      "share": {
        "url": "http://localhost:3000/bizzles/client/ama-kojo-wedding",
        "isShared": true,
        "passwordProtected": true,
        "shareExpiresAt": "2026-08-14T12:00:00.000Z",
        "shareLinkExpiryDays": 30,
        "allowDownloads": true
      },
      "selectionLocked": false,
      "maxSelections": 40,
      "selectionSubmittedAt": null,
      "deletedAt": null,
      "restoreDeadline": null,
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-07-20T15:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "totalPages": 1,
    "hasMore": false
  }
}
```

---

## Gallery inspector

### `GET /galleries`

**Query:** `slug` (share slug), `studioEmail`, `clientName`, `dateFrom`, `dateTo`, `status` (`draft`|`selecting`|`done`|`all`), `shared`, `passwordProtected`, `selectionLocked`, `allowDownloads`, `trashOnly`, `search`, `page`, `limit`

**Sample `200`** — same list row shape as photographer galleries (`items[]` + `pagination`).

**UI search bar:** slug / studio email / client name / date range. Row badges: status, shared, password lock, downloads off, selection locked.

### `GET /galleries/:galleryId`

**Sample `200`**

```json
{
  "gallery": {
    "id": "665f0a1b2c3d4e5f6789abcd",
    "name": "Ama & Kojo Wedding",
    "slug": "ama-kojo-wedding",
    "status": "selecting",
    "eventDate": "2026-06-14T12:00:00.000Z",
    "description": "Full-day wedding coverage",
    "galleryType": "wedding",
    "galleryTypeLabel": "Wedding",
    "client": { "id": "665f0a1b2c3d4e5f6789client", "name": "Ama Mensah" },
    "studio": {
      "userId": "665f0a1b2c3d4e5f67890123",
      "email": "studio@example.com",
      "companyName": "Bizzles Photography",
      "companySlug": "bizzles",
      "isActive": true
    },
    "photographerGalleryCounts": {
      "all": 12,
      "draft": 2,
      "selecting": 5,
      "done": 5,
      "trash": 1
    },
    "share": {
      "url": "http://localhost:3000/bizzles/client/ama-kojo-wedding",
      "tokenPresent": true,
      "isShared": true,
      "passwordProtected": true,
      "shareExpiresAt": "2026-08-14T12:00:00.000Z",
      "shareLinkExpiryDays": 30,
      "allowDownloads": true
    },
    "selection": {
      "locked": false,
      "maxSelections": 40,
      "submittedAt": null
    },
    "trash": null,
    "createdAt": "2026-05-01T10:00:00.000Z",
    "updatedAt": "2026-07-20T15:30:00.000Z"
  }
}
```

**UI panels:** Studio link → photographer detail · Share (copy URL, expiry countdown, password yes/no) · Selection locks · Counts for that studio.

### Share admin (all require `reason`)

| Method | Path | Body highlights |
|--------|------|-----------------|
| `POST` | `/galleries/:galleryId/share/revoke` | `{ "reason": "…" }` |
| `POST` | `/galleries/:galleryId/share/extend` | `{ "extendDays": 30, "reason": "…" }` or `{ "days": 60 }` / `{ "days": null }` never expire |
| `PATCH` | `/galleries/:galleryId/share` | `{ "allowDownloads": false, "selectionLocked": true, "reason": "…" }` |

**Sample `200` (patch)**

```json
{
  "message": "Gallery share settings updated",
  "gallery": {
    "id": "665f0a1b2c3d4e5f6789abcd",
    "share": {
      "url": "http://localhost:3000/bizzles/client/ama-kojo-wedding",
      "tokenPresent": true,
      "isShared": true,
      "passwordProtected": true,
      "shareExpiresAt": "2026-08-14T12:00:00.000Z",
      "shareLinkExpiryDays": 30,
      "allowDownloads": false
    },
    "selection": { "locked": true, "maxSelections": 40, "submittedAt": null }
  }
}
```

**Sample `200` (revoke)** — `share.tokenPresent: false`, `share.isShared: false`.

### Trash / purge

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/trash?ownerId=&page=&limit=` | Platform soft-deleted galleries |
| `POST` | `/trash/purge-expired` | Body: `{ "reason": "…", "ownerId?": "…" }` |
| `POST` | `/galleries/:galleryId/restore` | `{ "reason": "…" }` — `410` if deadline passed |
| `DELETE` | `/galleries/:galleryId/purge` | Permanent; `{ "reason": "…" }` required |
| `POST` | `/photographers/:userId/trash/empty` | Empty one studio; `{ "reason": "…" }` |

**Sample `GET /trash` `200`**

```json
{
  "retentionDays": 30,
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789abcd",
      "name": "Ama & Kojo Wedding",
      "slug": "ama-kojo-wedding",
      "status": "selecting",
      "studio": {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "companyName": "Bizzles Photography",
        "companySlug": "bizzles"
      },
      "deletedAt": "2026-07-10T09:00:00.000Z",
      "restoreDeadline": "2026-08-09T09:00:00.000Z",
      "restoreExpired": false
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**Sample purge expired `200`**

```json
{
  "message": "Expired trash purged",
  "result": { "galleries": 3, "photos": 12, "finals": 4 }
}
```

**UI:** confirm modals for purge/empty; show countdown from `restoreDeadline`; disable restore when `restoreExpired`.

---

## Moderation

### `GET /moderation/flagged-finals?ownerId=&page=&limit=`

**Sample `200`**

```json
{
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789final",
      "galleryId": "665f0a1b2c3d4e5f6789abcd",
      "galleryName": "Ama & Kojo Wedding",
      "gallerySlug": "ama-kojo-wedding",
      "originalFilename": "edit-012.jpg",
      "flaggedAt": "2026-07-26T16:20:00.000Z",
      "feedback": { "comment": "Skin tone looks off", "thread": [] },
      "studio": {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "companyName": "Bizzles Photography",
        "companySlug": "bizzles"
      },
      "createdAt": "2026-07-20T10:00:00.000Z",
      "updatedAt": "2026-07-26T16:20:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**UI:** queue list → open gallery inspector / studio. This is client-flagged finals (not a separate abuse report model).

---

## Aggregate CRM

**Default:** no client email/phone/location.  
**PII:** `includePii=true` **and** `reason=…` (min 3 chars). Backend logs admin email, role, and reason.

### `GET /crm/studios?search=&ownerId=&page=&limit=`

**Sample `200`**

```json
{
  "items": [
    {
      "userId": "665f0a1b2c3d4e5f67890123",
      "email": "studio@example.com",
      "companyName": "Bizzles Photography",
      "companySlug": "bizzles",
      "isActive": true,
      "clientCount": 48,
      "latestClientAt": "2026-07-22T11:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 96,
    "totalPages": 2,
    "hasMore": true
  },
  "note": "Aggregate client counts only — no client PII in this response"
}
```

### `GET /crm/studios/:userId`

**Sample `200` (no PII)**

```json
{
  "studio": {
    "userId": "665f0a1b2c3d4e5f67890123",
    "email": "studio@example.com",
    "companyName": "Bizzles Photography",
    "companySlug": "bizzles",
    "isActive": true
  },
  "totals": {
    "clients": 48,
    "upcomingBookings": 6,
    "bookingsThisMonth": 3
  },
  "includePii": false,
  "recentClients": [
    {
      "id": "665f0a1b2c3d4e5f6789client",
      "name": "Ama Mensah",
      "createdAt": "2026-07-22T11:00:00.000Z"
    }
  ]
}
```

**Sample `200` (with PII)** — `?includePii=true&reason=Support%20ticket%20123`

```json
{
  "includePii": true,
  "recentClients": [
    {
      "id": "665f0a1b2c3d4e5f6789client",
      "name": "Ama Mensah",
      "email": "ama@example.com",
      "phone": "+233209998877",
      "location": "Accra",
      "createdAt": "2026-07-22T11:00:00.000Z"
    }
  ]
}
```

**UI:** gate PII behind a reason modal; show audit notice.

### `GET /crm/bookings`

**Query:** `ownerId`, `dateFrom`, `dateTo`, `shootType` (or `category`), `includePii`, `reason`, `page`, `limit`

**Sample `200` (no PII)**

```json
{
  "includePii": false,
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789book",
      "title": "Ama & Kojo Wedding",
      "category": "wedding",
      "categoryLabel": "Wedding",
      "startsAt": "2026-08-14T09:00:00.000Z",
      "endsAt": "2026-08-14T18:00:00.000Z",
      "amountCharged": 8500,
      "currency": "GHS",
      "invoicedAt": null,
      "studio": {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "companyName": "Bizzles Photography",
        "companySlug": "bizzles"
      },
      "client": {
        "id": "665f0a1b2c3d4e5f6789client",
        "name": "Ama Mensah"
      },
      "createdAt": "2026-05-01T10:00:00.000Z",
      "updatedAt": "2026-05-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

With PII, items also include `location` and `client.email` / `phone` / `location`.

**UI:** calendar or agenda by `startsAt`; color by `category`; filter chips for studio + shoot type.

---

## Messaging (email / SMS to photographers)

Already production-ready. Recipients are **studios**, not gallery clients.

### `GET /communications/config`

```json
{
  "sms": { "configured": true, "defaultSender": "GIDTRANSFR" },
  "email": { "configured": true },
  "limits": {
    "maxRecipients": null,
    "maxSmsLength": 480,
    "maxEmailMessageLength": 10000,
    "maxSubjectLength": 200
  }
}
```

Disable send buttons when `configured: false`.

### `POST /communications/sms`

```json
{
  "userIds": ["665f0a1b2c3d4e5f67890123"],
  "message": "Hello from Gidtransfer admin."
}
```

Also accepts `userId` or `filter` (same shape as photographer list filters).

**Sample `200`**

```json
{
  "message": "SMS communication processed",
  "communication": {
    "id": "665f0a1b2c3d4e5f6789comm1",
    "channel": "sms",
    "subject": "",
    "message": "Hello from Gidtransfer admin.",
    "summary": { "targeted": 1, "sent": 1, "failed": 0, "skipped": 0 },
    "recipients": [
      {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "phone": "+233241234567",
        "companyName": "Bizzles Photography",
        "status": "sent"
      }
    ],
    "createdAt": "2026-07-28T04:10:00.000Z"
  }
}
```

### `POST /communications/email`

```json
{
  "userIds": ["665f0a1b2c3d4e5f67890123"],
  "subject": "Important platform update",
  "message": "Hi there,\n\nWe wanted to share an update."
}
```

Response shape matches SMS with `channel: "email"`.

### `POST /photographers/:userId/communicate`

```json
{
  "channels": ["email", "sms"],
  "subject": "Quick note from support",
  "message": "Thanks for reaching out. Your account is all set."
}
```

**Sample `200`**

```json
{
  "message": "Communication processed",
  "results": {
    "sms": { "id": "…", "channel": "sms", "summary": { "targeted": 1, "sent": 1, "failed": 0, "skipped": 0 } },
    "email": { "id": "…", "channel": "email", "summary": { "targeted": 1, "sent": 1, "failed": 0, "skipped": 0 } }
  }
}
```

### `GET /communications?channel=sms|email&userId=&page=&limit=`

History list of past sends (`items` + `pagination`).

---

## Billing admin

Plans: **`free` (30-day trial + 3-day grace, 3 galleries, no comments/sets/video) | `basic` (GHS 32/mo or 380/yr) | `pro` (GHS 60/mo or 650/yr) | `premium` (GHS 120/mo or 1300/yr)**. After grace, photographers are view-only until they renew.  
Aliases on write: `starter` → `basic`, `business` → `pro`, `studio` → `premium`.  
API field `storageLimitBytes` (alias on write: `storageBytes`). Responses also echo `storageBytes` / `price` for UI convenience.  
Each plan includes `features` (boolean map), `featureKeys`, `supportTier`, and marketing `perks`. Photographer app: [`billing-plans-frontend.md`](./billing-plans-frontend.md).

### `GET /billing/plans`

**Sample `200`**

```json
{
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "description": "30-day free trial — up to 3 client galleries, bookings, CRM, and basic analytics.",
      "storageLimitBytes": 5368709120,
      "storageBytes": 5368709120,
      "storageLabel": "5 GB",
      "maxGalleries": 3,
      "price": 0,
      "priceGhs": 0,
      "interval": "monthly",
      "trialDays": 30,
      "perks": [
        "30-day free trial",
        "Up to 3 client galleries",
        "Analytics dashboard",
        "5 GB storage"
      ],
      "features": { "analyticsDashboard": true, "customBranding": false, "galleryAi": false, "restoreTrashItems": false },
      "supportTier": "contact",
      "paystackPlanCode": null,
      "available": true
    },
    {
      "id": "premium",
      "name": "Premium",
      "description": "Premium plan — unlimited galleries, Gallery AI, trash restore, full Pro toolkit, and 250 GB storage.",
      "storageLimitBytes": 268435456000,
      "storageBytes": 268435456000,
      "storageLabel": "250 GB",
      "maxGalleries": null,
      "price": 120,
      "priceGhs": 120,
      "yearlyPriceGhs": 1300,
      "interval": "monthly",
      "trialDays": null,
      "perks": [
        "Everything in Pro",
        "Unlimited client galleries",
        "250 GB storage",
        "Gallery AI descriptions & smart picks",
        "Restore deleted galleries & photos"
      ],
      "features": { "customBranding": true, "advancedAnalytics": true, "galleryAi": true, "restoreTrashItems": true },
      "supportTier": "premium",
      "paystackPlanCode": "PLN_premium_sample",
      "available": true
    }
  ]
}
```

`maxGalleries: null` = unlimited.

### `PATCH /billing/plans/:planId`

```json
{
  "storageLimitBytes": 268435456000,
  "maxGalleries": null,
  "priceGhs": 120,
  "perks": ["250 GB storage", "Gallery AI", "Everything in Pro"],
  "featureKeys": ["clientGalleries", "customBranding", "advancedAnalytics", "galleryAi", "restoreTrashItems"],
  "supportTier": "premium",
  "description": "Premium plan — gallery AI plus the full Pro toolkit.",
  "reason": "Adjust Premium plan limits"
}
```

**Sample `200`**

```json
{
  "message": "Plan updated",
  "plan": {
    "id": "pro",
    "name": "Premium",
    "storageLimitBytes": 107374182400,
    "storageBytes": 107374182400,
    "storageLabel": "100 GB",
    "maxGalleries": null,
    "perks": ["100 GB storage", "Unlimited galleries", "Priority support"],
    "priceGhs": 199,
    "interval": "monthly",
    "available": true
  }
}
```

### `PUT /photographers/:userId/limit-override`

Temporary bump:

```json
{
  "storageLimitBytes": 214748364800,
  "maxGalleries": 50,
  "expiresInDays": 30,
  "reason": "Temporary bump for launch week"
}
```

Clear:

```json
{ "clear": true, "reason": "Temporary bump expired" }
```

**Sample `200` (set)**

```json
{
  "message": "Limit override applied",
  "subscription": {
    "planId": "pro",
    "planName": "Pro",
    "storageLimitBytes": 214748364800,
    "storageLabel": "200 GB",
    "maxGalleries": 50,
    "status": "active",
    "limitOverride": {
      "storageLimitBytes": 214748364800,
      "maxGalleries": 50,
      "expiresAt": "2026-08-27T04:00:00.000Z",
      "reason": "Temporary bump for launch week",
      "setAt": "2026-07-28T04:00:00.000Z"
    }
  }
}
```

**UI:** show effective limits from `subscription.storageLimitBytes` / `maxGalleries`; badge when `limitOverride` is non-null.

### `GET /billing/events?category=paid|failed|dispute|other&userId=&eventType=&reference=&page=&limit=`

**Sample `200`**

```json
{
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789bill",
      "eventId": "409758321",
      "eventType": "charge.success",
      "category": "paid",
      "reference": "GT_SUB_abc123",
      "amount": 199,
      "currency": "GHS",
      "status": "success",
      "processedAt": "2026-07-01T08:00:00.000Z",
      "createdAt": "2026-07-01T08:00:00.000Z",
      "user": {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "companyName": "Bizzles Photography",
        "companySlug": "bizzles",
        "planId": "pro"
      }
    },
    {
      "id": "665f0a1b2c3d4e5f6789bil2",
      "eventId": "409758399",
      "eventType": "invoice.payment_failed",
      "category": "failed",
      "reference": "GT_SUB_abc123",
      "amount": 199,
      "currency": "GHS",
      "status": "failed",
      "processedAt": "2026-07-15T08:00:00.000Z",
      "createdAt": "2026-07-15T08:00:00.000Z",
      "user": {
        "userId": "665f0a1b2c3d4e5f67890123",
        "email": "studio@example.com",
        "companyName": "Bizzles Photography",
        "companySlug": "bizzles",
        "planId": "pro"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 2,
    "totalPages": 1,
    "hasMore": false
  }
}
```

**UI tabs/filters:** Paid / Failed / Dispute. Amount is major units (GHS), not pesewas.

---

## Support inbox

### `GET /issue-reports?status=open|resolved|all&topic=&search=&page=&limit=`

**Sample `200`**

```json
{
  "items": [
    {
      "id": "665f0a1b2c3d4e5f6789issue",
      "topic": "billing",
      "topicLabel": "Billing",
      "description": "Subscription charged twice",
      "status": "open",
      "accountId": "GT-10042",
      "userEmail": "studio@example.com",
      "ownerId": "665f0a1b2c3d4e5f67890123",
      "createdAt": "2026-07-25T12:00:00.000Z",
      "updatedAt": "2026-07-25T12:00:00.000Z"
    }
  ],
  "topics": [
    { "id": "billing", "label": "Billing" },
    { "id": "galleries", "label": "Galleries" }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 7,
    "totalPages": 1,
    "hasMore": false
  }
}
```

### `PATCH /issue-reports/:id`

```json
{ "status": "resolved" }
```

**Sample `200`**

```json
{
  "message": "Report resolved",
  "report": {
    "id": "665f0a1b2c3d4e5f6789issue",
    "status": "resolved",
    "topic": "billing"
  }
}
```

---

## SMS sender IDs

### `GET /sms/sender-ids?status=pending|approved|rejected|all`

**Sample `200`**

```json
{
  "items": [
    {
      "userId": "665f0a1b2c3d4e5f67890123",
      "accountId": "GT-10042",
      "email": "studio@example.com",
      "companyName": "Bizzles Photography",
      "smsSenderId": "BIZZLES",
      "smsSenderStatus": "approved",
      "smsSenderRequestedAt": "2026-03-01T10:00:00.000Z",
      "smsSenderApprovedAt": "2026-03-01T10:05:00.000Z",
      "smsSenderRejectedReason": ""
    }
  ]
}
```

### `PATCH /sms/sender-ids/:userId/approve` · `…/reject`

Reject body: `{ "reason": "Name conflicts with another brand" }`.

Responses return `{ message, user }` (full studio user shape).

---

## Errors (shared)

| Status | When | Body |
|--------|------|------|
| `400` | Validation / missing `reason` | `{ "message": "…" }` |
| `401` | Missing/invalid admin token | `{ "message": "…" }` |
| `403` | Not an admin | `{ "message": "Admin access required" }` |
| `404` | Unknown id | `{ "message": "…" }` |
| `410` | Restore past deadline | `{ "message": "Restore deadline has passed" }` |
| `500` | Server | `{ "message": "Server error" }` |

Destructive / audited actions that need **`reason`**: share revoke/extend/patch, restore, purge, empty trash, plan updates, limit overrides, CRM PII export.

---

## UI composition tips

1. **List → detail** — photographer `userId` and gallery `id` are the primary navigation keys.
2. **Bytes** — prefer `storageLabel` / `storageLimitLabel` for display; use raw bytes for progress bars.
3. **Null limits** — `maxGalleries: null` and never-expiring share (`shareExpiresAt: null` with active token) mean unlimited / never.
4. **PII** — never persist CRM PII in local storage; fetch only after reason confirmation.
5. **Messaging** — show `summary.sent/failed/skipped` toast after bulk send; expand `recipients` for failures.
6. **Billing events** — `category` is the UI filter; `eventType` is the raw Paystack name for detail drawers.

---

## Quick route index

```
POST   /api/admin/auth/login
GET    /api/admin/auth/me
GET    /api/admin/stats

GET    /api/admin/photographers
GET    /api/admin/photographers/:userId
GET    /api/admin/photographers/:userId/sessions
GET    /api/admin/photographers/:userId/galleries
PATCH  /api/admin/photographers/:userId/activate|deactivate
POST   /api/admin/photographers/:userId/verify-email
POST   /api/admin/photographers/:userId/communicate
PUT    /api/admin/photographers/:userId/limit-override
POST   /api/admin/photographers/:userId/trash/empty

GET    /api/admin/galleries
GET    /api/admin/galleries/:galleryId
POST   /api/admin/galleries/:galleryId/share/revoke|extend
PATCH  /api/admin/galleries/:galleryId/share
POST   /api/admin/galleries/:galleryId/restore
DELETE /api/admin/galleries/:galleryId/purge

GET    /api/admin/moderation/flagged-finals
GET    /api/admin/trash
POST   /api/admin/trash/purge-expired

GET    /api/admin/crm/studios
GET    /api/admin/crm/studios/:userId
GET    /api/admin/crm/bookings

GET    /api/admin/communications/config
GET    /api/admin/communications
POST   /api/admin/communications/sms|email

GET    /api/admin/billing/plans
PATCH  /api/admin/billing/plans/:planId
GET    /api/admin/billing/events

GET    /api/admin/issue-reports
PATCH  /api/admin/issue-reports/:id

GET    /api/admin/sms/sender-ids
PATCH  /api/admin/sms/sender-ids/:userId/approve|reject
```

Live catalog on a running API: `GET /api` → `admin` section.
