import os
from pathlib import Path

import pytest

os.environ.setdefault("AUTH_MODE", "mock")
os.environ.setdefault("MOCK_JWT_SECRET", "test-secret")
os.environ["SQLITE_PATH"] = str(Path(__file__).parent / ".pytest-poc.sqlite3")

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.main import app  # noqa: E402
from app.schema import create_all  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    """Fresh in-memory database seeded once for the whole session."""
    conn = db.reset_for_tests(":memory:")
    create_all(conn)
    seed(force=True)
    yield conn


@pytest.fixture(scope="session")
def client(database):
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def tokens(client):
    """One bearer token per persona, keyed by persona id."""
    out = {}
    for pid in range(1, 11):
        r = client.post("/api/v1/auth/mock-token", json={"persona_id": pid})
        assert r.status_code == 200, r.text
        out[pid] = r.json()["access_token"]
    return out


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# Persona shorthands used across the suite.
P1_CSUITE = 1          # CORP-HOSP
P3_JFK_DIRECTOR = 3    # LOC-JFK
P5_BISTRO_MGR = 5      # SITE-JFK-T4-BISTRO
P6_REPORTER = 6        # SITE-JFK-T4-BISTRO, own claims only
P7_UNAUTHORISED = 7    # no org_node

# ── second tenant (CORP-RETAIL). Same privilege shapes as 1/3/5 so a test can hold
# the role constant and vary only the client. ─────────────────────────────────
T2_CSUITE = 8          # CORP-RETAIL
T2_REGIONAL = 9        # LOC-NW-NORTH
T2_STORE_MGR = 10      # SITE-NW-LEEDS

CLIENT_A = "CORP-HOSP"
CLIENT_B = "CORP-RETAIL"
