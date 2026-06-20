# LeadMap — Auth Testing Playbook (Emergent Google Auth)

## How auth works in this app
- Primary login: "Sign in with Google" button → redirects to `https://auth.emergentagent.com/?redirect=<origin>/dashboard`
- After Google login, user lands at `<redirect>#session_id=<id>`
- App detects `#session_id=` synchronously in `App.js` AppRoutes → renders `<AuthCallback>`
- AuthCallback POSTs `X-Session-ID: <id>` to `/api/auth/session`
- Backend exchanges with Emergent (`https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data`)
- Backend stores `user_sessions` doc with session_token + user_email + expires_at (7 days)
- Backend sets httpOnly cookie `session_token` + returns `{user, needs_onboarding}`
- For non-master without business_type → redirected to `/onboarding`

Backup: demo login (collapsed under "Or use demo login") issues a JWT bearer for the same get_current_user dependency.

## Master account
- Email: ashkjid@gmail.com
- is_master=true, can_export=true (always)
- Skips onboarding, sees Admin Console in sidebar

## Step 1 — Bypass real Google for browser tests (insert session manually)
```bash
mongosh leadmap --eval "
var token = 'test_session_' + Date.now();
db.users.updateOne(
  { email: 'master.test@example.com' },
  { \$set: {
      user_id: 'user_test_' + Date.now().toString(36),
      email: 'master.test@example.com',
      name: 'Test Master',
      picture: '',
      is_master: true,
      can_export: true,
      business_type: null,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
  }},
  { upsert: true }
);
db.user_sessions.insertOne({
  session_token: token,
  user_email: 'master.test@example.com',
  expires_at: new Date(Date.now() + 7*24*3600*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('SESSION_TOKEN=' + token);
"
```

## Step 2 — Test backend endpoints
```bash
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
TOKEN=<paste token from Step 1>

# /auth/me via cookie
curl -s -b "session_token=$TOKEN" "$API/api/auth/me"

# /auth/me via Bearer (also works)
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/auth/me"

# Master-only endpoint
curl -s -b "session_token=$TOKEN" "$API/api/admin/settings"
```

## Step 3 — Browser test (set cookie before navigation)
```python
await page.context.add_cookies([{
  "name": "session_token",
  "value": "<token>",
  "domain": "2b79e8ff-524a-4c1c-8da9-ec599a9e75ef.preview.emergentagent.com",
  "path": "/",
  "httpOnly": True,
  "secure": True,
  "sameSite": "None"
}])
await page.goto("https://2b79e8ff-524a-4c1c-8da9-ec599a9e75ef.preview.emergentagent.com/dashboard")
```

## Cleanup
```bash
mongosh leadmap --eval "
db.users.deleteMany({email: /\.test@example\.com\$/});
db.user_sessions.deleteMany({user_email: /\.test@example\.com\$/});
"
```

## Failure indicators
- ❌ /auth/me returns 401 → cookie not sent (check `withCredentials: true` in axios)
- ❌ /auth/session returns 401 with "user_data_not_found" → session_id expired or invalid
- ❌ Login page reloads in a loop → AuthProvider not skipping /me check on hash#session_id

## Success indicators
- ✅ Click "Sign in with Google" → returns to /dashboard logged in
- ✅ Sidebar shows MASTER badge for ashkjid@gmail.com
- ✅ Non-master users routed to /onboarding on first login
