"""LeadMap — Emergent Google Auth backend tests (iteration 2)

Covers:
- /api/admin/public-config exposes emergent_auth_enabled=true
- /api/auth/session error paths (missing header / invalid session_id)
- Cookie-based session_token auth via seeded user_sessions row
- Bearer-based session_token auth
- Legacy JWT bearer (demo login) still works
- /api/auth/onboarding for master vs non-master
- /api/auth/logout clears cookie + deletes user_sessions row
- Master-only endpoints with cookie auth
- Public-config sanity
"""
import os
import time
import datetime as dt
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "leadmap")
MASTER_EMAIL = "ashkjid@gmail.com"

ts = int(time.time() * 1000)
NM_EMAIL = f"TEST_emerge_nm_{ts}@test.com"
MASTER_TEST_EMAIL = f"TEST_emerge_master_{ts}@test.com"


@pytest.fixture(scope="module")
def mongo():
    c = MongoClient(MONGO_URL)
    db = c[DB_NAME]
    yield db
    # cleanup TEST_ users + sessions
    db.users.delete_many({"email": {"$regex": "^TEST_emerge_"}})
    db.user_sessions.delete_many({"user_email": {"$regex": "^TEST_emerge_"}})
    c.close()


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _seed_session(db, email, name, is_master=False, business_type=None):
    """Seed a user_sessions row directly (bypasses Emergent OAuth)."""
    token = f"test_token_{email}_{int(time.time()*1000)}"
    now = dt.datetime.now(dt.timezone.utc)
    db.users.update_one(
        {"email": email},
        {"$set": {
            "user_id": f"u_{int(time.time()*1000)}",
            "email": email,
            "name": name,
            "picture": "",
            "is_master": is_master,
            "can_export": is_master,
            "business_type": business_type,
            "created_at": now.isoformat(),
            "last_login": now.isoformat(),
        }},
        upsert=True,
    )
    db.user_sessions.insert_one({
        "session_token": token,
        "user_email": email,
        "expires_at": (now + dt.timedelta(days=7)).isoformat(),
        "created_at": now.isoformat(),
    })
    return token


# ---------- Public config ----------
class TestPublicConfig:
    def test_emergent_auth_enabled(self, http):
        r = http.get(f"{BASE_URL}/api/admin/public-config")
        assert r.status_code == 200
        data = r.json()
        assert data.get("emergent_auth_enabled") is True
        assert data.get("master_email") == MASTER_EMAIL
        assert "max_results" in data


# ---------- /api/auth/session error paths ----------
class TestAuthSession:
    def test_missing_session_id_header_returns_400(self, http):
        r = http.post(f"{BASE_URL}/api/auth/session")
        assert r.status_code == 400
        assert "X-Session-ID" in r.text or "header" in r.text.lower()

    def test_invalid_session_id_returns_401_or_502(self, http):
        # Emergent should reject a bogus session_id; backend returns 401
        # (502 acceptable if Emergent service unreachable in test env)
        r = http.post(
            f"{BASE_URL}/api/auth/session",
            headers={"X-Session-ID": "totally_invalid_session_id_xyz"},
        )
        assert r.status_code in (401, 502), f"Unexpected status: {r.status_code} body={r.text[:200]}"

    def test_session_token_alone_does_not_validate_via_session_endpoint(self, http, mongo):
        """Inserting a user_sessions row directly should NOT make /auth/session validate.
        Emergent verifies the session_id, not our session_token, so passing the
        token as X-Session-ID must still 401."""
        tok = _seed_session(mongo, NM_EMAIL, "NM Test", is_master=False, business_type="Cafes")
        r = http.post(
            f"{BASE_URL}/api/auth/session",
            headers={"X-Session-ID": tok},
        )
        assert r.status_code in (401, 502)


# ---------- Cookie-based auth ----------
class TestCookieAuth:
    def test_auth_me_via_cookie(self, http, mongo):
        tok = _seed_session(mongo, NM_EMAIL, "NM Test", is_master=False, business_type="Cafes")
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            cookies={"session_token": tok},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == NM_EMAIL
        assert data["is_master"] is False
        assert data["business_type"] == "Cafes"

    def test_auth_me_via_bearer_session_token(self, http, mongo):
        tok = _seed_session(mongo, NM_EMAIL, "NM Test", is_master=False, business_type="Cafes")
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["email"] == NM_EMAIL

    def test_no_auth_returns_401(self, http):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401


# ---------- Legacy JWT (demo login) still works ----------
class TestLegacyJWT:
    def test_demo_login_jwt_bearer(self, http):
        email = f"TEST_emerge_jwt_{int(time.time()*1000)}@test.com"
        r = http.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": email, "name": "JWT Test", "business_type": "Cafes"},
        )
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        me = http.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert me.status_code == 200
        assert me.json()["email"] == email.lower()


# ---------- Onboarding ----------
class TestOnboarding:
    def test_onboarding_non_master_missing_type_returns_400(self, http, mongo):
        email = f"TEST_emerge_ob_nm_{int(time.time()*1000)}@test.com"
        tok = _seed_session(mongo, email, "OB NM", is_master=False, business_type=None)
        r = requests.post(
            f"{BASE_URL}/api/auth/onboarding",
            json={"business_type": ""},
            cookies={"session_token": tok},
        )
        assert r.status_code == 400

    def test_onboarding_non_master_with_type_persists(self, http, mongo):
        email = f"TEST_emerge_ob_ok_{int(time.time()*1000)}@test.com"
        tok = _seed_session(mongo, email, "OB OK", is_master=False, business_type=None)
        r = requests.post(
            f"{BASE_URL}/api/auth/onboarding",
            json={"business_type": "Restaurants"},
            cookies={"session_token": tok},
        )
        assert r.status_code == 200
        # verify via /auth/me
        me = requests.get(
            f"{BASE_URL}/api/auth/me",
            cookies={"session_token": tok},
        ).json()
        assert me["business_type"] == "Restaurants"

    def test_onboarding_master_no_business_type_required(self, http, mongo):
        email = f"TEST_emerge_ob_master_{int(time.time()*1000)}@test.com"
        tok = _seed_session(mongo, email, "OB Master", is_master=True, business_type=None)
        r = requests.post(
            f"{BASE_URL}/api/auth/onboarding",
            json={"business_type": ""},  # empty allowed for master
            cookies={"session_token": tok},
        )
        assert r.status_code == 200
        assert r.json().get("success") is True


# ---------- Logout ----------
class TestLogout:
    def test_logout_clears_cookie_and_session(self, http, mongo):
        email = f"TEST_emerge_logout_{int(time.time()*1000)}@test.com"
        tok = _seed_session(mongo, email, "Logout User", is_master=False, business_type="Cafes")

        # Confirm session works
        me = requests.get(
            f"{BASE_URL}/api/auth/me", cookies={"session_token": tok}
        )
        assert me.status_code == 200

        # Logout
        r = requests.post(
            f"{BASE_URL}/api/auth/logout",
            cookies={"session_token": tok},
        )
        assert r.status_code == 200
        # Verify user_sessions row deleted
        assert mongo.user_sessions.find_one({"session_token": tok}) is None
        # Set-Cookie header should clear the cookie (max-age=0 or expires in past)
        sc = r.headers.get("set-cookie", "")
        assert "session_token" in sc.lower()

        # Subsequent request with the same token must fail
        me2 = requests.get(f"{BASE_URL}/api/auth/me", cookies={"session_token": tok})
        assert me2.status_code == 401


# ---------- Master-only endpoints with cookie auth ----------
class TestMasterCookieAuth:
    def test_admin_settings_master_via_cookie(self, http, mongo):
        tok = _seed_session(mongo, MASTER_TEST_EMAIL, "Master Test", is_master=True, business_type=None)
        r = requests.get(
            f"{BASE_URL}/api/admin/settings",
            cookies={"session_token": tok},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "google_places_api_key" in data
        assert "data_source" in data

    def test_admin_settings_non_master_403_via_cookie(self, http, mongo):
        email = f"TEST_emerge_nonmaster_{int(time.time()*1000)}@test.com"
        tok = _seed_session(mongo, email, "Non Master", is_master=False, business_type="Cafes")
        r = requests.get(
            f"{BASE_URL}/api/admin/settings",
            cookies={"session_token": tok},
        )
        assert r.status_code == 403

    def test_admin_users_list_via_cookie(self, http, mongo):
        tok = _seed_session(mongo, MASTER_TEST_EMAIL, "Master Test", is_master=True)
        r = requests.get(
            f"{BASE_URL}/api/admin/users",
            cookies={"session_token": tok},
        )
        assert r.status_code == 200
        assert "users" in r.json()
