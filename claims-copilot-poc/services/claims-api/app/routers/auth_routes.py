"""
Persona listing and mock token issue.

Mock tokens exist so the POC runs without an Okta tenant. They are unavailable when
AUTH_MODE=okta. Production delegates authentication to Okta via PKCE; custom identity
stores are not permitted under the Meridian Pattern (NFR-33).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import settings
from ..auth.tokens import issue_mock_token
from ..db import query, query_one

router = APIRouter(prefix="/auth", tags=["auth"])


class MockTokenRequest(BaseModel):
    persona_id: int


@router.get("/personas")
def list_personas():
    rows = query(
        """SELECT p.persona_id, p.name, p.example_role, p.level, p.org_node,
                  p.groups_csv, p.client_id, o.display_name AS org_display_name,
                  cl.display_name AS client_display_name
           FROM personas p
           LEFT JOIN org_nodes o ON o.org_node = p.org_node
           LEFT JOIN clients cl ON cl.client_id = p.client_id
           ORDER BY p.client_id, p.persona_id"""
    )
    return {
        "auth_mode": settings.AUTH_MODE,
        "personas": [
            {
                "persona_id": r["persona_id"],
                "name": r["name"],
                "example_role": r["example_role"],
                "level": r["level"],
                "org_node": r["org_node"],
                "org_display_name": r["org_display_name"],
                # Surfaced so the persona picker can group by tenant - the isolation
                # story is only legible if you can see which client you are signing
                # in as.
                "client_id": r["client_id"],
                "client_display_name": r["client_display_name"],
                "groups": [g for g in (r["groups_csv"] or "").split(",") if g],
            }
            for r in rows
        ],
    }


@router.post("/mock-token")
def mock_token(body: MockTokenRequest):
    persona = query_one(
        "SELECT * FROM personas WHERE persona_id = :p", {"p": body.persona_id}
    )
    if not persona:
        raise HTTPException(404, "Unknown persona")
    return {
        "access_token": issue_mock_token(persona),
        "token_type": "Bearer",
        "expires_in": settings.TOKEN_TTL_SECONDS,
    }
