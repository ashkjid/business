# LeadMap — Product Requirements Document

## Original Problem Statement
Build a private B2B lead-generation web app where users:
1. Click any location on a Google Map to set search center
2. Pick a business category from dropdown
3. Get all matching businesses from Google Places (name, address, phone, email, hours, rating, reviews, website)
4. Sort/paginate (50/page) the results table
5. Select rows individually, "first N", or all
6. Bulk-send Email outreach (Gmail SMTP, From = login email, locked) or WhatsApp click-to-chat
7. Export Excel / PDF (gated by master)

Master account `ashkjid@gmail.com` has admin tab to set Google Places API key, toggle data source (api/scraper), and grant per-user Excel/PDF export permission. Non-master users limited to 2 different categories per session and 2 recipients per outreach. Login uses demo mode (email+name+OTP) until real Google OAuth credentials are provided.

## Stack
- Backend: FastAPI + MongoDB (Motor) + JWT + Cryptography (Fernet) + httpx + aiosmtplib + BeautifulSoup
- Frontend: React + shadcn/ui + Cabinet Grotesk + IBM Plex Sans + @react-google-maps/api + xlsx + jspdf + sonner
- Auth: Demo OTP login (Google OAuth ID-token verification supported when GOOGLE_OAUTH_CLIENT_ID is set)
- Hosting target: Azure (per user); built on Emergent first, will migrate later

## User Personas
1. **Master Operator** (ashkjid@gmail.com) — full access, settings, all exports, no per-session limits
2. **Team User** (any other Google email) — pre-selects business type at signup; limited to 2 categories/session, 2 recipients/email send, exports gated by master

## Core Requirements (Static)
- Volatile sessions — search results live only on frontend
- Pagination 50 per page (top + bottom controls)
- "Select first N" + "Select all on page" + "Select All" + total count badge
- Email From = login email, non-editable (Gmail SMTP via user's App Password)
- WhatsApp = `wa.me/<phone>?text=<msg>` click-to-chat
- Export Excel/PDF disabled for everyone except master, with admin toggle per user
- Settings/API-key UI hidden from non-master users
- Email auto-extraction via website deep-crawl (mailto + regex on /, /contact, /about pages)

## Implemented (Feb 2026)
### Backend (`/app/backend/server.py`)
- POST /api/auth/login — demo login (email + name + business_type), returns JWT
- POST /api/auth/session — Emergent Google Auth: takes X-Session-ID header, exchanges with `https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data`, sets httpOnly cookie + creates user, returns {user, needs_onboarding}
- POST /api/auth/onboarding — non-master sets business_type after first Google login
- POST /api/auth/logout — clears cookie + deletes user_sessions row
- GET /api/auth/me — accepts cookie session_token OR Authorization Bearer (JWT or session_token)
- GET /api/admin/public-config (frontend bootstrap, includes emergent_auth_enabled)
- POST /api/places/search — Google Places New v1 textSearch with locationBias, paginated up to MAX_RESULTS (500)
- POST /api/places/extract-emails — concurrent website crawl, semaphore=8
- POST /api/email/configure (gmail address must equal login email)
- POST /api/email/send-bulk (rate cap 2 for non-master; gmail-config required)
- GET/PUT /api/admin/settings (master-only — Places API key + data_source)
- GET /api/admin/users (master-only)
- PUT /api/admin/users/{email}/permissions (master-only — toggle can_export)

### Frontend
- /login — Swiss split-screen, "Sign in with Google" PRIMARY (Emergent flow), "Or use demo login" collapsed below
- /dashboard (auth required) — Map picker with **Google Places Autocomplete text box** + click-to-select fallback, category dropdown, sortable results, sticky bulk toolbar
- /onboarding (auth required, non-master without business_type) — business type picker
- /profile — Gmail App Password setup
- /admin (master-only) — 3 tabs: API Keys / Data Source / User Permissions
- AuthCallback page at /pages/AuthCallback.jsx — synchronously detected via App.js AppRoutes (window.location.hash includes session_id=)
- AuthProvider in /lib/auth.jsx skips /auth/me check during AuthCallback to avoid race condition

### Tested
- Iteration 1: 20/20 backend tests passed
- Iteration 2: 35/35 backend tests passed (15 new Emergent auth + 20 regression). Frontend 100% on tested flows: master cookie auth, onboarding redirect, master skip-onboarding, admin gating, logout, AuthCallback exchange.

## Known Gaps / Backlog
### P1 — User action required (NOT a code issue)
- **Enable "Maps JavaScript API" SKU** on the user's GCP project for key `AIzaSyDY2cCGbC8CUViIyrngTbKsJkWyArwWUN4`. Currently shows "This page can't load Google Maps correctly". The same key already works for Places API (different SKU). User must enable Maps JavaScript API + ensure billing is on + remove referrer restrictions or whitelist `*.preview.emergentagent.com`.

### P1 — Awaiting credentials from user
- Real Google OAuth Client ID/Secret (login currently uses demo OTP path)
- Twilio for real SMS OTP (currently mocked client-side; safe to keep — user opted to skip phone login)

### P2 — Future enhancements
- Persist last 5 searches per user to MongoDB (optional, currently volatile)
- WhatsApp Business API (bulk automated send) — currently click-to-chat only
- Per-user "selected count" or "rows allowed" granular permission (user opted "no" to this)
- Rate-limit Places API spend per user
- Migrate to Azure (Container Apps + Cosmos for Mongo) when ready

## Next Action Items
1. User: enable "Maps JavaScript API" on GCP project (5-min change, no code)
2. User: provide Google OAuth Client ID/Secret when ready → set `GOOGLE_OAUTH_CLIENT_ID` env var to flip from demo to real Google login
3. (Optional) Add real-time progress indicator for email deep-crawl (currently shows "extracting…" badge)
