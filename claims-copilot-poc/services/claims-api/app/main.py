"""
Claims API - POC.

Stands in for the Claims Copilot service layer. What matters architecturally is not the
mock data but where the rules live: organisational scope in app/auth/scope.py, document
audience in app/services/sdms_proxy.py, both applied server-side on every route.
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import settings
from .db import connect
from .routers import (
    analytics_routes, auth_routes, claims_routes, config_routes, export_routes,
    map_routes, fnol_routes, message_routes, notification_routes, pin_routes,
    preference_routes, views_routes,
)
from .schema import create_all, migrate
from .seed import assign_tenancy, backfill_coordinates, backfill_exhibit5_fields, seed

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("claims-api")

app = FastAPI(
    title="Claims Copilot Client Experience API (POC)",
    version="0.1.0",
    description=(
        "Tier 1 proof of concept. Enforces BR-001 organisational scope and the "
        "Pillar 1 document audience model server-side."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router, prefix="/api/v1")
app.include_router(config_routes.router, prefix="/api/v1")
app.include_router(claims_routes.router, prefix="/api/v1")
app.include_router(map_routes.router, prefix="/api/v1")
app.include_router(fnol_routes.router, prefix="/api/v1")
app.include_router(notification_routes.router, prefix="/api/v1")
app.include_router(message_routes.router, prefix="/api/v1")
app.include_router(preference_routes.router, prefix="/api/v1")
app.include_router(views_routes.router, prefix="/api/v1")
app.include_router(export_routes.router, prefix="/api/v1")
app.include_router(pin_routes.router, prefix="/api/v1")
app.include_router(analytics_routes.router, prefix="/api/v1")


@app.on_event("startup")
def startup() -> None:
    conn = connect()
    create_all(conn)
    applied = migrate(conn)
    if applied:
        log.info("Applied additive migrations: %s", ", ".join(applied))
    stats = seed()
    backfilled = backfill_coordinates()
    if backfilled:
        log.info("Backfilled coordinates on %d claims", backfilled)
    ex5 = backfill_exhibit5_fields()
    if ex5:
        log.info("Backfilled Exhibit 5 fields on %d claims", ex5)
    # Tenancy must be assigned before any request is served: a row with a NULL
    # client_id is invisible to the two-predicate filter, which would look like
    # missing data rather than a fault.
    tenancy = assign_tenancy()
    if tenancy:
        log.info("Assigned tenancy: %s", tenancy)
    if stats.get("skipped"):
        log.info("Database already seeded.")
    else:
        log.info("Seeded: %s", stats)
    log.info("AUTH_MODE=%s  DB_KIND=%s", settings.AUTH_MODE, settings.DB_KIND)
    if settings.AUTH_MODE == "mock":
        log.warning(
            "Mock auth is enabled. Tokens are locally signed - development only. "
            "Production delegates to Okta (NFR-33)."
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "auth_mode": settings.AUTH_MODE, "db": settings.DB_KIND}


@app.get("/")
def root() -> dict[str, object]:
    return {
        "service": "claims-copilot-poc-api",
        "docs": "/docs",
        "personas": "/api/v1/auth/personas",
    }
