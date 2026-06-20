from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt as pyjwt
from cryptography.fernet import Fernet
import httpx
import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ----- Config -----
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMAIL_KEY = os.environ['EMAIL_ENCRYPTION_KEY'].encode()
MASTER_EMAIL = os.environ.get('MASTER_EMAIL', 'ashkjid@gmail.com').lower()
MAX_RESULTS = int(os.environ.get('MAX_RESULTS_PER_SEARCH', '500'))
GOOGLE_OAUTH_CLIENT_ID = os.environ.get('GOOGLE_OAUTH_CLIENT_ID', '')
DEFAULT_PLACES_API_KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')
EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

cipher = Fernet(EMAIL_KEY)

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI(title="LeadMap API")
api = APIRouter(prefix="/api")


# ----- Models -----
class DemoLoginIn(BaseModel):
    email: EmailStr
    name: str
    picture: Optional[str] = ""
    business_type: Optional[str] = None


class UserOut(BaseModel):
    email: str
    name: str
    picture: Optional[str] = ""
    is_master: bool
    can_export: bool
    business_type: Optional[str] = None
    has_gmail_config: bool = False
    gmail_address: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    user: UserOut


class SessionAuthOut(BaseModel):
    user: UserOut
    needs_onboarding: bool


class BusinessTypeIn(BaseModel):
    business_type: str


class SearchIn(BaseModel):
    latitude: float
    longitude: float
    radius_meters: int = Field(default=5000, ge=100, le=50000)
    business_type: str
    location_name: Optional[str] = ""
    data_source: Optional[str] = "api"


class PlaceOut(BaseModel):
    place_id: str
    name: str
    address: str = ""
    phone: Optional[str] = None
    website: Optional[str] = None
    email: Optional[str] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    opening_hours: Optional[str] = None
    types: List[str] = []
    google_url: Optional[str] = None


class SearchOut(BaseModel):
    total: int
    results: List[PlaceOut]


class EmailExtractIn(BaseModel):
    items: List[Dict[str, Optional[str]]]


class GmailConfigIn(BaseModel):
    gmail_address: EmailStr
    app_password: str


class EmailRecipient(BaseModel):
    name: str
    email: EmailStr


class SendBulkEmailIn(BaseModel):
    recipients: List[EmailRecipient]
    subject: str
    body: str


class AdminSettingsIn(BaseModel):
    google_places_api_key: Optional[str] = None
    data_source: Optional[str] = None


class UserPermissionIn(BaseModel):
    can_export: bool


# ----- Helpers -----
def make_jwt(email: str) -> str:
    payload = {"sub": email, "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        email=u["email"],
        name=u.get("name", ""),
        picture=u.get("picture", ""),
        is_master=bool(u.get("is_master")),
        can_export=bool(u.get("can_export") or u.get("is_master")),
        business_type=u.get("business_type"),
        has_gmail_config=bool(u.get("gmail_app_password_enc")),
        gmail_address=u.get("gmail_address"),
    )


async def _user_from_session_cookie(token: str) -> Optional[dict]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            return None
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or expires_at < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"email": sess["user_email"]}, {"_id": 0})


async def get_current_user(request: Request) -> dict:
    # 1) Cookie session_token (Emergent Google Auth)
    cookie_token = request.cookies.get("session_token")
    if cookie_token:
        u = await _user_from_session_cookie(cookie_token)
        if u:
            return u
    # 2) Authorization: Bearer JWT (demo login)
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        # Try Emergent session_token sent via Bearer
        u = await _user_from_session_cookie(token)
        if u:
            return u
        # Try our JWT
        try:
            payload = pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            email = payload.get("sub")
            user = await db.users.find_one({"email": email}, {"_id": 0})
            if user:
                return user
        except Exception:
            pass
    raise HTTPException(401, "Not authenticated")


async def require_master(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_master"):
        raise HTTPException(403, "Master access required")
    return user


async def get_setting(key: str, default: str = "") -> str:
    doc = await db.settings.find_one({"key": key}, {"_id": 0})
    return doc["value"] if doc else default


async def set_setting(key: str, value: str):
    await db.settings.update_one({"key": key}, {"$set": {"key": key, "value": value}}, upsert=True)


async def upsert_user(email: str, name: str, picture: str) -> dict:
    email = email.lower()
    is_master = email == MASTER_EMAIL
    now_iso = datetime.now(timezone.utc).isoformat()
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if not existing:
        new_user = {
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": email,
            "name": name,
            "picture": picture or "",
            "is_master": is_master,
            "can_export": is_master,
            "business_type": None,
            "created_at": now_iso,
            "last_login": now_iso,
        }
        await db.users.insert_one(new_user)
        return new_user
    update = {"last_login": now_iso, "name": name or existing.get("name", ""), "picture": picture or existing.get("picture", "")}
    await db.users.update_one({"email": email}, {"$set": update})
    existing.update(update)
    return existing


# ----- Auth: Emergent Google -----
@api.post("/auth/session", response_model=SessionAuthOut)
async def auth_session(request: Request, response: Response):
    """Exchange Emergent session_id for our auth cookie. Frontend sends X-Session-ID header."""
    session_id = request.headers.get("X-Session-ID") or request.headers.get("x-session-id")
    if not session_id:
        raise HTTPException(400, "X-Session-ID header required")

    async with httpx.AsyncClient(timeout=15) as cx:
        try:
            r = await cx.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": session_id})
        except Exception as e:
            raise HTTPException(502, f"Emergent auth unavailable: {e}")
        if r.status_code != 200:
            raise HTTPException(401, f"Invalid session: {r.text[:200]}")
        data = r.json()

    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(401, "Email missing from auth response")

    user = await upsert_user(email, data.get("name", ""), data.get("picture", ""))
    session_token = data.get("session_token")
    if not session_token:
        raise HTTPException(502, "No session_token from Emergent")

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


@api.post("/auth/logout")
async def auth_logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"success": True}


@api.post("/auth/onboarding")
async def auth_onboarding(payload: BusinessTypeIn, user: dict = Depends(get_current_user)):
    if user.get("is_master"):
        return {"success": True, "message": "Master skips onboarding"}
    if not payload.business_type or not payload.business_type.strip():
        raise HTTPException(400, "business_type required")
    await db.users.update_one(
        {"email": user["email"]},
        {"$set": {"business_type": payload.business_type.strip()}},
    )
    return {"success": True}


# ----- Auth: Demo (kept as fallback) -----
@api.post("/auth/login", response_model=TokenOut)
async def auth_demo_login(payload: DemoLoginIn):
    if not payload.email or not payload.name:
        raise HTTPException(400, "email and name are required")

    email = payload.email.lower()
    is_master = email == MASTER_EMAIL
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if not existing and not is_master and not payload.business_type:
        raise HTTPException(400, "business_type is required for new non-master users")

    user = await upsert_user(email, payload.name, payload.picture or "")
    if payload.business_type and not user.get("business_type"):
        await db.users.update_one({"email": email}, {"$set": {"business_type": payload.business_type}})
        user["business_type"] = payload.business_type

    return TokenOut(access_token=make_jwt(email), user=user_to_out(user))


@api.get("/auth/me", response_model=UserOut)
async def auth_me(user: dict = Depends(get_current_user)):
    return user_to_out(user)


# ----- Places Search -----
async def google_places_search(query: str, lat: float, lng: float, radius: int, api_key: str) -> List[dict]:
    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,"
            "places.nationalPhoneNumber,places.internationalPhoneNumber,"
            "places.websiteUri,places.rating,places.userRatingCount,"
            "places.location,places.regularOpeningHours,places.types,"
            "places.googleMapsUri,nextPageToken"
        ),
    }
    all_places: List[dict] = []
    page_token: Optional[str] = None
    body_base = {
        "textQuery": query,
        "pageSize": 20,
        "locationBias": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": float(min(radius, 50000)),
            }
        },
    }
    async with httpx.AsyncClient(timeout=20) as cx:
        for _ in range(25):
            payload = dict(body_base)
            if page_token:
                payload["pageToken"] = page_token
            r = await cx.post(url, json=payload, headers=headers)
            if r.status_code != 200:
                logger.error(f"Places API error: {r.status_code} {r.text[:300]}")
                if not all_places:
                    raise HTTPException(502, f"Google Places API error: {r.text[:200]}")
                break
            data = r.json()
            all_places.extend(data.get("places", []))
            page_token = data.get("nextPageToken")
            if not page_token or len(all_places) >= MAX_RESULTS:
                break
            await asyncio.sleep(1.2)
    return all_places[:MAX_RESULTS]


def parse_place(p: dict) -> PlaceOut:
    loc = p.get("location") or {}
    hours = p.get("regularOpeningHours") or {}
    desc = hours.get("weekdayDescriptions") or []
    return PlaceOut(
        place_id=p.get("id", ""),
        name=(p.get("displayName") or {}).get("text", "Unknown"),
        address=p.get("formattedAddress", ""),
        phone=p.get("nationalPhoneNumber") or p.get("internationalPhoneNumber"),
        website=p.get("websiteUri"),
        rating=p.get("rating"),
        review_count=p.get("userRatingCount"),
        latitude=loc.get("latitude"),
        longitude=loc.get("longitude"),
        opening_hours=" | ".join(desc) if desc else None,
        types=p.get("types", []) or [],
        google_url=p.get("googleMapsUri"),
    )


@api.post("/places/search", response_model=SearchOut)
async def places_search(payload: SearchIn, user: dict = Depends(get_current_user)):
    api_key = await get_setting("google_places_api_key", DEFAULT_PLACES_API_KEY)
    if not api_key:
        raise HTTPException(400, "Google Places API key not configured. Master must set it in settings.")
    data_source = payload.data_source
    if not user.get("is_master"):
        data_source = await get_setting("data_source", "api")
    query = f"{payload.business_type} in {payload.location_name}" if payload.location_name else payload.business_type
    if data_source == "scraper":
        logger.info("Scraper mode selected (mocked → using API)")
    raw = await google_places_search(query, payload.latitude, payload.longitude, payload.radius_meters, api_key)
    results = [parse_place(p) for p in raw]
    return SearchOut(total=len(results), results=results)


# ----- Email Extraction -----
EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")


async def crawl_website_for_email(cx: httpx.AsyncClient, website: str) -> Optional[str]:
    if not website:
        return None
    try:
        r = await cx.get(website, follow_redirects=True, timeout=6)
        if r.status_code != 200 or not r.text:
            return None
        soup = BeautifulSoup(r.text, "lxml")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.lower().startswith("mailto:"):
                em = href.split(":", 1)[1].split("?")[0].strip()
                if EMAIL_REGEX.fullmatch(em):
                    return em.lower()
        text = soup.get_text(" ", strip=True)
        m = EMAIL_REGEX.search(text)
        if m:
            email = m.group(0).lower()
            if not any(x in email for x in ["sentry", "wixpress", "example.com", "domain.com"]):
                return email
        for path in ["/contact", "/contact-us", "/about"]:
            try:
                cu = website.rstrip("/") + path
                rr = await cx.get(cu, follow_redirects=True, timeout=5)
                if rr.status_code == 200:
                    s2 = BeautifulSoup(rr.text, "lxml")
                    for a in s2.find_all("a", href=True):
                        if a["href"].lower().startswith("mailto:"):
                            em = a["href"].split(":", 1)[1].split("?")[0].strip()
                            if EMAIL_REGEX.fullmatch(em):
                                return em.lower()
                    m2 = EMAIL_REGEX.search(s2.get_text(" ", strip=True))
                    if m2:
                        return m2.group(0).lower()
            except Exception:
                continue
        return None
    except Exception:
        return None


@api.post("/places/extract-emails")
async def places_extract_emails(payload: EmailExtractIn, user: dict = Depends(get_current_user)):
    sem = asyncio.Semaphore(8)
    results: Dict[str, Optional[str]] = {}
    async with httpx.AsyncClient(headers={"User-Agent": "Mozilla/5.0 LeadMapBot"}) as cx:
        async def task(item):
            pid = item.get("place_id")
            site = item.get("website")
            if not pid:
                return
            async with sem:
                em = await crawl_website_for_email(cx, site) if site else None
                results[pid] = em
        await asyncio.gather(*(task(i) for i in payload.items[:MAX_RESULTS]))
    return {"emails": results}


# ----- Gmail SMTP -----
@api.post("/email/configure")
async def email_configure(payload: GmailConfigIn, user: dict = Depends(get_current_user)):
    if user["email"].lower() != payload.gmail_address.lower():
        raise HTTPException(400, "Gmail address must match your login email (the From email is non-editable).")
    enc = cipher.encrypt(payload.app_password.encode()).decode()
    await db.users.update_one(
        {"email": user["email"]},
        {"$set": {"gmail_app_password_enc": enc, "gmail_address": payload.gmail_address.lower()}},
    )
    return {"success": True, "message": "Gmail configured securely"}


async def send_one_email(from_email: str, app_password: str, to_email: str, subject: str, body: str) -> bool:
    msg = MIMEMultipart()
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))
    try:
        async with aiosmtplib.SMTP(hostname="smtp.gmail.com", port=587, start_tls=True) as smtp:
            await smtp.login(from_email, app_password)
            await smtp.sendmail(from_email, [to_email], msg.as_string())
        return True
    except Exception as e:
        logger.error(f"send mail failed to {to_email}: {e}")
        return False


@api.post("/email/send-bulk")
async def email_send_bulk(payload: SendBulkEmailIn, user: dict = Depends(get_current_user)):
    if not user.get("is_master") and len(payload.recipients) > 2:
        raise HTTPException(403, "Non-master users can only send to up to 2 recipients per outreach.")
    if not user.get("gmail_app_password_enc"):
        raise HTTPException(400, "Configure your Gmail App Password in Profile first.")
    from_email = user["email"]
    try:
        app_password = cipher.decrypt(user["gmail_app_password_enc"].encode()).decode()
    except Exception:
        raise HTTPException(500, "Gmail credentials corrupted; please re-configure.")
    sent = 0
    failed: List[str] = []
    for r in payload.recipients:
        body = payload.body.replace("{name}", r.name).replace("{email}", r.email)
        subject = payload.subject.replace("{name}", r.name)
        ok = await send_one_email(from_email, app_password, r.email, subject, body)
        if ok:
            sent += 1
        else:
            failed.append(r.email)
    return {"sent": sent, "failed": failed, "from": from_email}


# ----- Admin -----
@api.get("/admin/settings")
async def admin_get_settings(user: dict = Depends(require_master)):
    api_key = await get_setting("google_places_api_key", DEFAULT_PLACES_API_KEY)
    data_source = await get_setting("data_source", "api")
    return {"google_places_api_key": api_key, "data_source": data_source}


@api.put("/admin/settings")
async def admin_put_settings(payload: AdminSettingsIn, user: dict = Depends(require_master)):
    if payload.google_places_api_key is not None:
        await set_setting("google_places_api_key", payload.google_places_api_key.strip())
    if payload.data_source is not None:
        if payload.data_source not in ("api", "scraper"):
            raise HTTPException(400, "data_source must be 'api' or 'scraper'")
        await set_setting("data_source", payload.data_source)
    return {"success": True}


@api.get("/admin/users")
async def admin_list_users(user: dict = Depends(require_master)):
    rows = await db.users.find({}, {"_id": 0, "gmail_app_password_enc": 0}).to_list(1000)
    return {"users": rows}


@api.put("/admin/users/{email}/permissions")
async def admin_user_permissions(email: str, payload: UserPermissionIn, user: dict = Depends(require_master)):
    target = await db.users.find_one({"email": email.lower()})
    if not target:
        raise HTTPException(404, "User not found")
    if target.get("is_master"):
        return {"success": True, "note": "Master always has export permission."}
    await db.users.update_one({"email": email.lower()}, {"$set": {"can_export": bool(payload.can_export)}})
    return {"success": True}


@api.get("/admin/public-config")
async def public_config():
    return {
        "google_oauth_enabled": bool(GOOGLE_OAUTH_CLIENT_ID),
        "emergent_auth_enabled": True,
        "master_email": MASTER_EMAIL,
        "max_results": MAX_RESULTS,
    }


@api.get("/")
async def root():
    return {"service": "LeadMap API", "status": "ok"}


app.include_router(api)

# CORS — explicit origins to support credentials (cookies)
_origins = os.environ.get('CORS_ORIGINS', '*').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_db():
    await db.users.create_index("email", unique=True)
    await db.settings.create_index("key", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)


@app.on_event("shutdown")
async def shutdown_db():
    client.close()
