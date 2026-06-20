# LeadMap → Azure Migration Playbook

This document walks you through migrating LeadMap (FastAPI + React + MongoDB) from the Emergent platform to Microsoft Azure, end-to-end.

---

## Phase 0 — Pre-flight (do this on Emergent before exporting)

| # | Task | Why |
|---|------|-----|
| 0.1 | Push code to GitHub via Emergent's "Save to GitHub" button | Only official export path |
| 0.2 | Note down your Google Places API key from `/app/backend/.env` | Same key works on Azure |
| 0.3 | Decide on a custom domain (e.g. `leadmap.yourcompany.com`) | Needed for Google OAuth redirect URIs |
| 0.4 | Create Google OAuth Client ID/Secret (Phase 2 below) | Replaces Emergent-managed auth |

---

## Phase 1 — Recommended Azure Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Internet                                                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                  ┌────────▼────────┐
                  │  Azure Front    │  (optional CDN + WAF)
                  │  Door / CDN     │
                  └────────┬────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼────────┐  ┌──────▼──────┐   ┌──────▼─────────┐
│ Static Web App │  │ App Service │   │ Cosmos DB      │
│ (React build)  │  │ (FastAPI)   │   │ for MongoDB    │
│                │  │ Python 3.11 │   │ (vCore or RU)  │
└────────────────┘  └──────┬──────┘   └────────────────┘
                           │
                  ┌────────▼─────────┐
                  │ Azure Key Vault  │
                  │ (secrets/keys)   │
                  └──────────────────┘
```

Service choices:
| Component | Service | Tier suggestion |
|-----------|---------|-----------------|
| React frontend | **Azure Static Web Apps** | Standard ($9/mo) — free SSL, custom domain, GitHub auto-deploy |
| FastAPI backend | **Azure App Service for Linux** | Basic B1 ($13/mo) for testing, P0v3 ($55/mo) for prod |
| MongoDB | **Azure Cosmos DB for MongoDB (vCore)** | M10 free tier or M30 paid (~$50/mo) |
| Secrets | **Azure Key Vault** | Standard ($0.03/10K ops) |
| Logs/metrics | **Application Insights** (built into App Service) | Free tier 5GB/mo |

Estimated total monthly cost: **~$80–120 USD** for production-grade. ~$25 for dev/staging.

---

## Phase 2 — Replace Emergent Google Auth with custom Google OAuth

**Why:** `https://auth.emergentagent.com/*` only works on Emergent infrastructure.

### Step 2.1 — Create Google OAuth credentials
1. Visit https://console.cloud.google.com/apis/credentials
2. Select your existing project (or create one — same project as your Places API key)
3. **APIs & Services → OAuth consent screen** → External → fill app name, support email, scopes (`email`, `profile`, `openid`)
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Name: `LeadMap Production`
   - **Authorized JavaScript origins:**
     - `https://leadmap.yourcompany.com` (your prod domain)
     - `https://leadmap-frontend.azurestaticapps.net` (Azure default domain)
     - `http://localhost:3000` (local dev)
   - **Authorized redirect URIs:**
     - `https://leadmap.yourcompany.com/auth/callback`
     - `https://leadmap-frontend.azurestaticapps.net/auth/callback`
     - `http://localhost:3000/auth/callback`
5. Copy the **Client ID** and **Client Secret** — store in Azure Key Vault.

### Step 2.2 — Backend code changes (drop-in replacement)
Replace the `/api/auth/session` endpoint in `server.py` with the custom Google OAuth handler in **`/app/backend/server_azure_auth_patch.py`** (created alongside this doc). It uses the official `google-auth` library to verify Google ID tokens directly — no Emergent backend involved.

### Step 2.3 — Frontend code changes
Replace the `signInWithGoogle()` function in `Login.jsx` with the Google Identity Services (GIS) flow shown in **`/app/frontend/src/pages/Login_azure.jsx.patch`**. It uses Google's official `g_id_signin` library and posts the ID token to your backend.

---

## Phase 3 — Provision Azure resources (CLI commands)

Pre-req: `az login` and `az account set --subscription <id>`.

### 3.1 — Resource group + Cosmos DB (Mongo vCore)
```bash
RG=leadmap-prod
LOC=eastus
COSMOS=leadmap-mongo

az group create -n $RG -l $LOC

az cosmosdb mongocluster create \
  --resource-group $RG \
  --cluster-name $COSMOS \
  --location $LOC \
  --administrator-login leadmapadmin \
  --administrator-login-password '<Strong#Pass1234>' \
  --server-version 7.0 \
  --shard-node-tier Free \
  --shard-node-count 1 \
  --shard-node-disk-size-gb 32 \
  --shard-node-ha false

# Allow public access (tighten later with VNet)
az cosmosdb mongocluster firewall-rule create \
  --resource-group $RG --cluster-name $COSMOS \
  --rule-name allow-azure --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
```
Get the connection string:
```bash
az cosmosdb mongocluster connection-string list \
  -g $RG --cluster-name $COSMOS --query "connectionStrings[0].connectionString" -o tsv
```
Replace `<password>` with your admin password. Save it as `MONGO_URL` for App Service.

### 3.2 — Key Vault for secrets
```bash
KV=leadmap-kv-$RANDOM
az keyvault create -g $RG -n $KV -l $LOC

az keyvault secret set --vault-name $KV --name MONGO-URL --value "<paste Mongo conn string>"
az keyvault secret set --vault-name $KV --name JWT-SECRET --value "$(openssl rand -hex 32)"
az keyvault secret set --vault-name $KV --name EMAIL-ENCRYPTION-KEY --value "$(python3 -c 'from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())')"
az keyvault secret set --vault-name $KV --name GOOGLE-PLACES-API-KEY --value "<your Places key>"
az keyvault secret set --vault-name $KV --name GOOGLE-OAUTH-CLIENT-ID --value "<from Phase 2>"
az keyvault secret set --vault-name $KV --name GOOGLE-OAUTH-CLIENT-SECRET --value "<from Phase 2>"
```

### 3.3 — App Service (FastAPI backend)
```bash
PLAN=leadmap-plan
APP=leadmap-api  # must be globally unique

az appservice plan create -g $RG -n $PLAN --is-linux --sku B1
az webapp create -g $RG -p $PLAN -n $APP --runtime "PYTHON:3.11"

# Enable managed identity so App Service can read Key Vault
az webapp identity assign -g $RG -n $APP

PRINCIPAL_ID=$(az webapp identity show -g $RG -n $APP --query principalId -o tsv)
az keyvault set-policy -n $KV --object-id $PRINCIPAL_ID --secret-permissions get list

# Wire up app settings (Key Vault references)
az webapp config appsettings set -g $RG -n $APP --settings \
  MONGO_URL="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/MONGO-URL/)" \
  DB_NAME="leadmap" \
  JWT_SECRET="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/JWT-SECRET/)" \
  EMAIL_ENCRYPTION_KEY="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/EMAIL-ENCRYPTION-KEY/)" \
  GOOGLE_PLACES_API_KEY="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/GOOGLE-PLACES-API-KEY/)" \
  GOOGLE_OAUTH_CLIENT_ID="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/GOOGLE-OAUTH-CLIENT-ID/)" \
  GOOGLE_OAUTH_CLIENT_SECRET="@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/GOOGLE-OAUTH-CLIENT-SECRET/)" \
  MASTER_EMAIL="ashkjid@gmail.com" \
  MAX_RESULTS_PER_SEARCH="500" \
  CORS_ORIGINS="https://leadmap.yourcompany.com,https://leadmap-frontend.azurestaticapps.net" \
  WEBSITES_PORT="8000" \
  SCM_DO_BUILD_DURING_DEPLOYMENT="true"

# Set startup command
az webapp config set -g $RG -n $APP --startup-file "uvicorn server:app --host 0.0.0.0 --port 8000"
```

### 3.4 — Static Web App (React frontend)
```bash
SWA=leadmap-frontend

az staticwebapp create -g $RG -n $SWA -l $LOC \
  --source https://github.com/<your-user>/<your-repo> \
  --branch main \
  --app-location "/frontend" \
  --output-location "build" \
  --login-with-github
```
Add app settings (build-time env vars):
```bash
az staticwebapp appsettings set -n $SWA --setting-names \
  REACT_APP_BACKEND_URL=https://$APP.azurewebsites.net \
  REACT_APP_GOOGLE_PLACES_API_KEY=<your Places key> \
  REACT_APP_GOOGLE_OAUTH_CLIENT_ID=<your OAuth client id>
```

### 3.5 — Custom domain (optional but recommended)
1. In Azure portal → Static Web Apps → Custom domains → Add
2. Verify ownership via DNS TXT record
3. Add CNAME `leadmap.yourcompany.com` → `<swa>.azurestaticapps.net`
4. Update Google OAuth Authorized origins/redirects to include the new domain

---

## Phase 4 — Code changes for Azure (delta from Emergent version)

### 4.1 — `backend/requirements.txt` — add
```
google-auth>=2.40.0
google-auth-oauthlib>=1.2.0
```

### 4.2 — `backend/server.py` — REMOVE
```python
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
# ... and the entire @api.post("/auth/session") block that calls it
```
**ADD** the new endpoint from `/app/backend/server_azure_auth_patch.py` (verifies Google ID token directly).

### 4.3 — `frontend/src/pages/Login.jsx` — REPLACE the `signInWithGoogle` function
Use the GIS button shown in `/app/frontend/src/pages/Login_azure.jsx.patch` — renders a real Google button that returns an ID token.

### 4.4 — `frontend/src/App.js` — REMOVE the `#session_id=` hash detection logic and `<AuthCallback>` page (no longer needed; Google ID token is posted directly from Login.jsx).

### 4.5 — `frontend/src/lib/auth.jsx` — REMOVE the "skip /auth/me if hash has session_id" branch.

---

## Phase 5 — Deploy

### 5.1 — Backend
GitHub Actions workflow (auto-generated when you set `--source github` on Static Web App, but for App Service you create it manually):

`.github/workflows/deploy-backend.yml`:
```yaml
name: Deploy backend
on:
  push:
    branches: [main]
    paths: [backend/**]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r backend/requirements.txt
      - uses: azure/webapps-deploy@v3
        with:
          app-name: leadmap-api
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: backend
```
Get publish profile: `az webapp deployment list-publishing-profiles -g $RG -n $APP --xml` → paste into GitHub secret `AZURE_WEBAPP_PUBLISH_PROFILE`.

### 5.2 — Frontend
Static Web Apps auto-deploys on push to the configured branch (set up in step 3.4).

### 5.3 — Smoke test
```bash
# Health check
curl https://leadmap-api.azurewebsites.net/api/

# Public config
curl https://leadmap-api.azurewebsites.net/api/admin/public-config

# Open https://leadmap-frontend.azurestaticapps.net → click "Sign in with Google"
```

---

## Phase 6 — Hardening for production

| Area | Action |
|------|--------|
| **TLS** | Static Web Apps + App Service give free SSL — verify HTTPS-only redirect is on |
| **Mongo network** | Switch Cosmos firewall to allow only App Service VNet |
| **Secrets rotation** | Rotate `JWT_SECRET` + `EMAIL_ENCRYPTION_KEY` quarterly via Key Vault |
| **App Service diagnostics** | Enable Application Insights (one click in Azure portal) |
| **Backups** | Cosmos auto-backs-up every 4h with 30-day PITR — verify retention |
| **Rate limiting** | Add `slowapi` middleware to FastAPI for `/api/places/search` (Google API costs $) |
| **Monitoring** | Set Application Insights alerts on `/api/places/search` 5xx rate > 1% |
| **CI checks** | GitHub Actions: `pytest backend/tests/ && yarn --cwd frontend lint && yarn --cwd frontend build` on every PR |

---

## Phase 7 — Cutover checklist

- [ ] Code pushed to GitHub
- [ ] Google OAuth Client ID/Secret created with prod redirect URIs
- [ ] Cosmos DB Mongo cluster live, connection string in Key Vault
- [ ] App Service deployed, `/api/` returns 200, `/api/admin/public-config` shows `google_oauth_enabled: true`
- [ ] Static Web App deployed, env vars set, custom domain verified
- [ ] CORS_ORIGINS on backend matches frontend domain exactly
- [ ] OAuth callback flow tested end-to-end with real Google account
- [ ] Master email (ashkjid@gmail.com) lands on /admin
- [ ] Non-master onboarding flow works (pick business type)
- [ ] Search → email extract → Gmail send works (using a non-Emergent Gmail App Password)
- [ ] Application Insights showing traffic
- [ ] DNS propagated, prod domain HTTPS-only

---

## Cost optimizer

Once stable, drop:
- App Service B1 → P0v3 (auto-scale 1–2 instances)
- Cosmos free tier → M30 vCore (better p95 latency)
- Add Azure Front Door for global CDN + WAF (~$35/mo)

---

## Rollback plan

Keep Emergent preview environment alive for 30 days. If Azure issues:
1. Revert DNS CNAME to Emergent preview URL
2. Re-set frontend `REACT_APP_BACKEND_URL` to Emergent backend URL
3. Re-enable Emergent OAuth flow (keep the old code in a `feature/emergent-auth` git branch)

---

**Done. You now have a production-grade, vendor-neutral LeadMap on Azure.**
