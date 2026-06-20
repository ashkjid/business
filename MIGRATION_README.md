# Quick-reference cheat sheet for LeadMap → Azure migration

## Files in this repo for the migration
| File | Purpose |
|------|---------|
| `/app/AZURE_MIGRATION.md` | Full step-by-step playbook (Phases 0–7) |
| `/app/backend/server_azure_auth_patch.py` | Drop-in custom Google OAuth backend code (replaces Emergent auth) |
| `/app/frontend/src/pages/Login_azure.jsx.patch` | Drop-in frontend Google sign-in button (replaces Emergent redirect) |

## TL;DR — 7 things you must do
1. **Push code to GitHub** (Emergent button "Save to GitHub")
2. **Create Google OAuth Client ID/Secret** at https://console.cloud.google.com/apis/credentials
3. **Provision Azure**: Cosmos DB Mongo (vCore), App Service Linux Python 3.11, Static Web App, Key Vault
4. **Replace Emergent auth code** with the patches in this folder
5. **Set environment variables** on App Service (Key Vault references) and Static Web App
6. **Add domains to Google OAuth** Authorized Origins + Redirect URIs (no trailing slashes!)
7. **Deploy** — App Service via GitHub Actions, Static Web App auto-deploys on push

## Cost estimate
- Dev: $25/mo (B1 App Service + Cosmos free tier + Static Web App free)
- Prod: $80–120/mo (P0v3 + M30 Cosmos vCore + Static Web App Standard)

## Things that DON'T change
- Google Places API (your same key works)
- Google Maps JavaScript API (same key)
- Gmail SMTP App Password flow
- All MongoDB schemas + collection names (`users`, `user_sessions`, `settings`)
- All other API endpoints (`/api/places/search`, `/api/email/send-bulk`, `/api/admin/*`)

## Things that CHANGE
- `/api/auth/session` → `/api/auth/google` (verifies Google ID token directly, no Emergent backend)
- `Login.jsx` "Sign in with Google" button → real Google Identity Services button
- `App.js` removes the `#session_id=` hash detection (no longer needed)
- `AuthCallback.jsx` → DELETE (no longer needed)
- `auth.jsx` removes the "skip /auth/me on hash" branch
