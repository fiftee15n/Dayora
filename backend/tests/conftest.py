import os
import tempfile
from datetime import datetime

_tmp = tempfile.mkdtemp(prefix="dayora-test-")
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["JWT_SECRET"] = "test-secret-test-secret-test-secret-123"
# Never send real email from tests, even if backend/.env has SMTP configured.
os.environ["SMTP_HOST"] = ""
os.environ["GOOGLE_CLIENT_IDS"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def register(client, email="sara@example.com", name="Sara"):
    r = client.post(
        "/api/auth/register", json={"name": name, "email": email, "password": "secret123"}
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def auth(client):
    """A client authenticated via Bearer token (mobile-style)."""
    data = register(client)
    client.cookies.clear()
    client.headers["Authorization"] = f"Bearer {data['access_token']}"
    # Behave like a real client: tell the API our local UTC offset so "today" matches date.today().
    offset = datetime.now().astimezone().utcoffset()
    client.headers["X-TZ-Offset"] = str(int(offset.total_seconds() // 60))
    return client
