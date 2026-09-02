"""
Token issue and validation.

Mock mode signs HS256 tokens locally so the POC needs no Okta tenant. Okta mode
validates RS256 tokens against the tenant JWKS endpoint. Either way the API treats the
token as the only source of identity and scope - nothing is read from the request body,
query string or headers for authorisation purposes.
"""
import time
from typing import Any

import jwt
from fastapi import Header, HTTPException, status

from .. import settings
from ..db import query_one

_jwks_client: Any = None


def issue_mock_token(persona: dict[str, Any]) -> str:
    if settings.AUTH_MODE != "mock":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mock tokens are disabled")

    groups = [g for g in (persona.get("groups_csv") or "").split(",") if g]
    now = int(time.time())
    payload = {
        "sub": f"poc|persona-{persona['persona_id']}",
        "name": persona["name"],
        "org_node": persona["org_node"],
        "client_id": persona.get("client_id"),
        "groups": groups,
        "locale": persona.get("locale") or "en-US",
        "persona_id": persona["persona_id"],
        "iat": now,
        "exp": now + settings.TOKEN_TTL_SECONDS,
        "iss": "poc-mock-issuer",
        "aud": settings.OKTA_AUDIENCE,
    }
    return jwt.encode(payload, settings.MOCK_JWT_SECRET, algorithm="HS256")


def _decode(token: str) -> dict[str, Any]:
    if settings.AUTH_MODE == "mock":
        return jwt.decode(
            token,
            settings.MOCK_JWT_SECRET,
            algorithms=["HS256"],
            audience=settings.OKTA_AUDIENCE,
        )

    # Okta path: validate the signature against the tenant JWKS (F-CC-07 prerequisite).
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = jwt.PyJWKClient(f"{settings.OKTA_ISSUER}/v1/keys")
    signing_key = _jwks_client.get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=settings.OKTA_AUDIENCE,
        issuer=settings.OKTA_ISSUER,
    )


class Principal:
    """The authenticated caller. Scope is derived here and nowhere else."""

    def __init__(self, claims: dict[str, Any]):
        self.sub: str = claims.get("sub", "")
        self.name: str = claims.get("name", "")
        self.org_node: str | None = claims.get("org_node")
        # Phase 1 tenancy. Asserted by the token and cross-checked against the
        # hierarchy in scope.py - a mismatch is refused, not reconciled.
        self.client_id: str | None = claims.get("client_id")
        self.groups: list[str] = list(claims.get("groups") or [])
        self.locale: str = claims.get("locale") or "en-US"
        self.persona_id: int | None = claims.get("persona_id")

    def has(self, privilege: str) -> bool:
        return privilege in self.groups


def current_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        claims = _decode(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}")
    return Principal(claims)
