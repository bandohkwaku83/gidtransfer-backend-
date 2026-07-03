# Photo Global API

Node.js backend for photographer sign-up, login, studio onboarding, clients, and bookings.

## Setup

```bash
cp .env.example .env
npm install
```

Edit `.env` with your MongoDB URL, JWT secret, and (for Google sign-in) `GOOGLE_CLIENT_ID`.

### Google sign-in

1. Create an OAuth 2.0 **Web client** in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Add `GOOGLE_CLIENT_ID` to `.env` (comma-separated if you have multiple client IDs, e.g. web + iOS).
3. The app sends the Google **ID token** from the client SDK to `POST /api/auth/google`.

## Run

```bash
npm start
```

Default port: **7100**

## API (user auth)

All protected routes use `Authorization: Bearer <token>` from **register**, **login**, or **Google** sign-in.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api` | API index |
| POST | `/api/auth/register` | Create account (email, password, `acceptedTerms: true`) |
| POST | `/api/auth/google` | Google sign-in or sign-up (`idToken`) |
| POST | `/api/auth/login` | Log in (email + password) |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password` | Set new password |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Log out (invalidates current JWT; requires Bearer token) |
| POST | `/api/auth/signout` | Alias for logout |
| POST | `/api/onboarding` | Complete studio setup (multipart: `companyName`, `companySlug`, `phone`, `primaryDeliverable`, `country`; optional `referralCode`, `logo` file) |
| GET | `/api/onboarding` | Studio profile |
| PUT | `/api/onboarding` | Update studio profile (same fields; partial) |
| GET | `/api/dashboard` | Dashboard stats |
| GET/POST/PUT/DELETE | `/api/clients` | Client CRUD (scoped to the logged-in user) |
| GET | `/api/bookings/meta` | Shoot types + legend for filters |
| GET | `/api/bookings/week-summary` | Bookings this week (count + range) |
| GET | `/api/bookings/stats` | Counts: this week, this month, today |
| GET | `/api/bookings/upcoming` | Next upcoming booking |
| GET | `/api/bookings` | List (`year`, `month`, optional `type`, `day`, `from`, `to`) |
| GET | `/api/bookings/:id` | Single booking |
| POST | `/api/bookings` | Create (`title`, `clientId`, `date`, `shootType`, `start`, optional `end`, `amountCharged`, `location`, `notes`) |
| PUT | `/api/bookings/:id` | Update booking (same fields, partial) |
| DELETE | `/api/bookings/:id` | Delete booking |

Bookings and clients are always scoped to the logged-in user. `clientId` must be one of your clients.

Import `postman/Photo_Global.postman_collection.json` and `postman/Photo_Global.local.postman_environment.json`. **Select the environment** in Postman, then run **Auth → Login** or **Register** — tests save the JWT to the environment `token` (and collection). Run **Auth → Me** to verify before other folders.
