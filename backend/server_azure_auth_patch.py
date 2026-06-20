# Drop-in replacement for Emergent Auth → Custom Google OAuth (Azure version)
#
# HOW TO APPLY:
# 1. Open /app/backend/server.py
# 2. DELETE the existing @api.post("/auth/session") block (lines that exchange X-Session-ID with Emergent)
# 3. PASTE the code below into server.py at the same location
# 4. Add this import near the top:
#       from google.oauth2 import id_token
#       from google.auth.transport import requests as g_requests
# 5. Add to backend/requirements.txt:
#       google-auth>=2.40.0
#       google-auth-oauthlib>=1.2.0
# 6. Set GOOGLE_OAUTH_CLIENT_ID env var on Azure App Service
#
# NOTES:
# - This verifies a Google ID token (issued by Google's identity services on the frontend)
# - No more Emergent backend dependency
# - Cookie + DB session storage stays identical to current implementation

class GoogleSignInIn(BaseModel):
    credential: str  # Google ID token (JWT) from frontend GIS button


@api.post("/auth/google", response_model=SessionAuthOut)
async def auth_google(payload: GoogleSignInIn, response: Response):
    """Verify Google ID token, create/upsert user, set httpOnly session cookie."""
    if not GOOGLE_OAUTH_CLIENT_ID:
        raise HTTPException(500, "GOOGLE_OAUTH_CLIENT_ID not configured")

    try:
        idinfo = id_token.verify_oauth2_token(
            payload.credential,
            g_requests.Request(),
            GOOGLE_OAUTH_CLIENT_ID,
        )
    except ValueError as e:
        raise HTTPException(401, f"Invalid Google credential: {e}")

    # Optional: enforce specific issuers
    if idinfo.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Unrecognized issuer")

    email = (idinfo.get("email") or "").lower()
    if not email or not idinfo.get("email_verified"):
        raise HTTPException(401, "Email missing or unverified")

    user = await upsert_user(email, idinfo.get("name", ""), idinfo.get("picture", ""))

    # Generate our own session token (replaces Emergent's session_token)
    session_token = f"sess_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_email": email,
        "expires_at": (now + timedelta(days=7)).isoformat(),
        "created_at": now.isoformat(),
    })

    response.set_cookie(
        key="session_token",
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )

    needs_onboarding = (not user.get("is_master")) and (not user.get("business_type"))
    return SessionAuthOut(user=user_to_out(user), needs_onboarding=needs_onboarding)
