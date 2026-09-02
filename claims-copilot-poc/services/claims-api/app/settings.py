"""Configuration. Values come from the environment; see .env.example at the repo root."""
import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    for candidate in (Path(__file__).resolve().parents[3] / ".env",
                      Path(__file__).resolve().parents[2] / ".env"):
        if candidate.exists():
            load_dotenv(candidate)
            break
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]

# AUTH_MODE=mock -> locally signed HS256 tokens so the POC runs with no Okta tenant.
# AUTH_MODE=okta -> real JWKS validation. Okta is the production path (NFR-33).
AUTH_MODE = os.getenv("AUTH_MODE", "mock").lower()
MOCK_JWT_SECRET = os.getenv("MOCK_JWT_SECRET", "poc-local-secret-do-not-use-in-any-real-environment")
TOKEN_TTL_SECONDS = int(os.getenv("TOKEN_TTL_SECONDS", "28800"))

OKTA_ISSUER = os.getenv("OKTA_ISSUER", "")
OKTA_AUDIENCE = os.getenv("OKTA_AUDIENCE", "api://default")

DB_KIND = os.getenv("DB_KIND", "sqlite").lower()
SQLITE_PATH = os.getenv("SQLITE_PATH", str(BASE_DIR / "data" / "poc.sqlite3"))

CONFIG_DIR = Path(os.getenv("CONFIG_DIR", str(REPO_ROOT / "config")))

CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")
    if o.strip()
]

API_PORT = int(os.getenv("API_PORT", "8000"))
