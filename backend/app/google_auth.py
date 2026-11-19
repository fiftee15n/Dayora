"""Verify Google ID tokens (from Google Sign-In on the phone) without extra SDKs.

The token is a JWT signed by Google; we check the signature against Google's published keys,
the audience (our OAuth client IDs), the issuer, expiry and that the email is verified.
"""

from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

from .config import settings

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

_jwks = PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True, lifespan=3600, timeout=10)


class GoogleTokenError(Exception):
    pass


class GoogleNotConfigured(GoogleTokenError):
    pass


@dataclass
class GoogleIdentity:
    sub: str
    email: str
    name: str
    picture: str | None


def verify_google_id_token(token: str) -> GoogleIdentity:
    audiences = settings.google_client_id_list
    if not audiences:
        raise GoogleNotConfigured("Google sign-in isn't set up on the server yet")
    try:
        key = _jwks.get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            key.key,
            algorithms=["RS256"],
            audience=audiences,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
            leeway=30,
        )
    except jwt.PyJWKClientConnectionError as e:
        raise GoogleTokenError("Couldn't reach Google to verify the sign-in") from e
    except jwt.PyJWTError as e:
        raise GoogleTokenError("Invalid Google sign-in token") from e

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleTokenError("Invalid Google sign-in token")
    email = claims.get("email")
    if not email or claims.get("email_verified") not in (True, "true"):
        raise GoogleTokenError("Your Google account's email isn't verified")
    return GoogleIdentity(
        sub=str(claims["sub"]),
        email=email.lower(),
        name=(claims.get("name") or "").strip(),
        picture=claims.get("picture"),
    )
