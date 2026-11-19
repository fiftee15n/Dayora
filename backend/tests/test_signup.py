"""Sign-up with an emailed 6-digit code, and Google sign-in."""

import time
from datetime import timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app import google_auth
from app.config import settings
from app.database import SessionLocal
from app.models import PendingSignup, User, utcnow

EMAIL = "sara.ahmed@example.com"
PASSWORD = "secret123"


def start(client, email=EMAIL, password=PASSWORD, **extra):
    return client.post("/api/auth/signup/start", json={"email": email, "password": password, **extra})


def _expire_resend_window(email=EMAIL):
    with SessionLocal() as db:
        p = db.query(PendingSignup).filter_by(email=email).one()
        p.sent_at = utcnow() - timedelta(seconds=settings.verification_resend_seconds + 1)
        db.commit()


# ---------------------------------------------------------------- email code


def test_signup_start_then_verify_creates_account(client):
    r = start(client)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == EMAIL
    assert body["resend_in"] > 0 and body["expires_in"] > 0
    code = body["dev_code"]
    assert code and len(code) == 6 and code.isdigit()

    # No account until the code is confirmed.
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 401

    r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": code})
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["access_token"]
    assert data["user"]["email"] == EMAIL
    assert data["user"]["name"] == "Sara Ahmed"  # derived from the email

    assert client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD}).status_code == 200
    with SessionLocal() as db:
        assert db.query(PendingSignup).count() == 0


def test_signup_name_is_used_when_given(client):
    code = start(client, name="  Sara A.  ").json()["dev_code"]
    r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": code})
    assert r.json()["user"]["name"] == "Sara A."


def test_signup_rejects_existing_email(client):
    code = start(client).json()["dev_code"]
    client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": code})
    r = start(client)
    assert r.status_code == 409


def test_signup_rejects_weak_password(client):
    assert start(client, password="short").status_code == 422
    assert start(client, password="onlyletters").status_code == 422


def test_wrong_code_counts_attempts_then_locks(client):
    code = start(client).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for left in range(settings.verification_max_attempts - 1, 0, -1):
        r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": wrong})
        assert r.status_code == 400
        assert f"{left} attempt" in r.json()["detail"]
    r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": wrong})
    assert "Too many" in r.json()["detail"]
    # Even the right code is refused now, until a new one is requested.
    r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": code})
    assert r.status_code == 400 and "Too many" in r.json()["detail"]


def test_code_format_is_validated(client):
    start(client)
    assert client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": "12ab56"}).status_code == 422


def test_expired_code_is_rejected(client):
    code = start(client).json()["dev_code"]
    with SessionLocal() as db:
        p = db.query(PendingSignup).filter_by(email=EMAIL).one()
        p.expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": code})
    assert r.status_code == 400 and "expired" in r.json()["detail"]


def test_resend_has_cooldown_and_replaces_code(client):
    first = start(client).json()["dev_code"]
    r = client.post("/api/auth/signup/resend", json={"email": EMAIL})
    assert r.status_code == 429

    _expire_resend_window()
    r = client.post("/api/auth/signup/resend", json={"email": EMAIL})
    assert r.status_code == 200, r.text
    second = r.json()["dev_code"]
    if second != first:  # 1 in a million they match
        assert client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": first}).status_code == 400
    assert client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": second}).status_code == 201


def test_resend_without_signup_is_404(client):
    assert client.post("/api/auth/signup/resend", json={"email": "nobody@example.com"}).status_code == 404


def test_pressing_start_again_within_cooldown_keeps_code(client):
    code = start(client).json()["dev_code"]
    again = start(client, password="newpass123").json()
    assert again["dev_code"] is None  # no new email sent
    r = client.post("/api/auth/signup/verify", json={"email": EMAIL, "code": code})
    assert r.status_code == 201
    # ...but the latest password is the one that counts.
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "newpass123"}).status_code == 200


# ---------------------------------------------------------------- Google


CLIENT_ID = "test-web-client.apps.googleusercontent.com"


@pytest.fixture
def google_keys(monkeypatch):
    """Stand in for Google's signing keys with a locally generated RSA key."""
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class _Key:
        key = private.public_key()

    class _FakeJwks:
        def get_signing_key_from_jwt(self, token):
            jwt.get_unverified_header(token)  # malformed tokens fail here, like the real client
            return _Key()

    monkeypatch.setattr(google_auth, "_jwks", _FakeJwks())
    monkeypatch.setattr(settings, "google_client_ids", CLIENT_ID)
    return private


def google_token(private, **overrides):
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "1234567890",
        "email": "sara@gmail.com",
        "email_verified": True,
        "name": "Sara Ahmed",
        "iat": now,
        "exp": now + 3600,
    }
    claims.update(overrides)
    return jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test"})


def test_google_creates_account_then_signs_in_again(client, google_keys):
    r = client.post("/api/auth/google", json={"id_token": google_token(google_keys)})
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    assert user["email"] == "sara@gmail.com" and user["name"] == "Sara Ahmed"

    r2 = client.post("/api/auth/google", json={"id_token": google_token(google_keys)})
    assert r2.status_code == 200 and r2.json()["user"]["id"] == user["id"]
    with SessionLocal() as db:
        assert db.query(User).count() == 1


def test_google_links_existing_email_account(client, google_keys):
    code = start(client, email="sara@gmail.com").json()["dev_code"]
    existing = client.post("/api/auth/signup/verify", json={"email": "sara@gmail.com", "code": code}).json()
    r = client.post("/api/auth/google", json={"id_token": google_token(google_keys)})
    assert r.status_code == 200
    assert r.json()["user"]["id"] == existing["user"]["id"]
    # The password still works too.
    assert client.post("/api/auth/login", json={"email": "sara@gmail.com", "password": PASSWORD}).status_code == 200


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "someone-else.apps.googleusercontent.com"},
        {"iss": "https://evil.example.com"},
        {"exp": int(time.time()) - 3600},
        {"email_verified": False},
    ],
)
def test_google_rejects_bad_tokens(client, google_keys, overrides):
    r = client.post("/api/auth/google", json={"id_token": google_token(google_keys, **overrides)})
    assert r.status_code == 401


def test_google_rejects_wrong_signature(client, google_keys):
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    r = client.post("/api/auth/google", json={"id_token": google_token(other)})
    assert r.status_code == 401


def test_google_rejects_garbage(client, google_keys):
    r = client.post("/api/auth/google", json={"id_token": "not-a-jwt-token-at-all-really"})
    assert r.status_code == 401


def test_google_not_configured_is_503(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_ids", "")
    r = client.post("/api/auth/google", json={"id_token": "x" * 40})
    assert r.status_code == 503
