"""Runs the real app (real routes, real SQL) against a throwaway local Postgres, with outside network blocked."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

import pytest

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:t@127.0.0.1:55432/postgres")
if urlparse(TEST_DB.replace("+asyncpg", "")).hostname not in ("127.0.0.1", "localhost"):
    raise SystemExit(f"Refusing to run: tests wipe the database and {TEST_DB.split('@')[-1]} is not local.")

# Set before the app is imported, and away from backend/ so no real .env (production database, API keys) is read.
os.chdir(Path(__file__).resolve().parent)
os.environ.update(
    APP_ENV="test", DATABASE_URL=TEST_DB, SYNC_DATABASE_URL=TEST_DB.replace("+asyncpg", "+psycopg"),
    JWT_SECRET="unit-test-secret-unit-test-secret-1234", REDIS_URL="", CORS_ORIGINS="https://app.example.test",
    FRONTEND_URL="https://app.example.test", GOOGLE_CLIENT_ID="test-id", GOOGLE_CLIENT_SECRET="test-secret",
    GOOGLE_REDIRECT_URI="https://api.example.test/api/mail/oauth/callback",
    MAIL_TOKEN_KEY="rvJ3hA4nX0v7mT1sV3bq0q7m0C3b2i6Q2wq3p1pVb1w=",
    BREVO_API_KEY="test-key", BREVO_SENDER_EMAIL="reports@example.test", BREVO_REPLY_TO="", REPORT_ENABLED="false",
    SUPER_ADMIN_EMAIL="owner@example.test", SUPER_ADMIN_PASSWORD="",
)

import httpx  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from starlette.testclient import TestClient  # noqa: E402

import app.main as main  # noqa: E402
from app.core.database import Base  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import (  # noqa: E402
    AuditLog, Client, CueEntry, Contributor, Episode, Project, ProjectType, Society, User, UserRole,
)
from app.models.work_delegation import WorkDelegation  # noqa: E402
from app.services import login_tracker, token_blacklist  # noqa: E402

PASSWORD = "Test@123"
_HASH = hash_password(PASSWORD)
ROLES = {r.value: r for r in UserRole}


class Net:
    """Stands in for the internet. Unmatched calls fail, so nothing can reach Google or Brevo by accident."""

    def __init__(self):
        self.calls: list[httpx.Request] = []
        self.routes: list[tuple] = []

    def on(self, method: str, url: str, reply):
        self.routes.insert(0, (method, url, reply))

    async def send(self, request, **_):
        self.calls.append(request)
        for method, url, reply in self.routes:
            if request.method == method and str(request.url).startswith(url):
                res = reply(request) if callable(reply) else reply
                res.request = request
                return res
        raise httpx.ConnectError(f"Blocked in tests: {request.method} {request.url}")

    def sent_to(self, url: str) -> list[httpx.Request]:
        return [c for c in self.calls if str(c.url).startswith(url)]


@pytest.fixture(autouse=True)
def net(monkeypatch):
    n = Net()
    monkeypatch.setattr(httpx.AsyncClient, "send", n.send)
    return n


@pytest.fixture(scope="session")
def sync_engine():
    engine = create_engine(os.environ["SYNC_DATABASE_URL"])
    with engine.begin() as c:
        c.execute(text("DROP SCHEMA public CASCADE"))
        c.execute(text("CREATE SCHEMA public"))
    yield engine
    engine.dispose()


async def _idle():
    return None


@pytest.fixture(scope="session")
def base_client(sync_engine):
    """One app instance and event loop for the whole run. Background loops stay off: tests call their logic directly."""
    main._followup_loop = main._mail_sync_loop = main._weekly_report_loop = _idle
    with TestClient(main.app, raise_server_exceptions=False, base_url="https://testserver") as client:
        yield client


@pytest.fixture(autouse=True)
def clean(request, base_client, sync_engine):
    """Every integration test starts from empty tables and clean in-memory lockouts and blacklists."""
    if "integration" not in str(request.fspath):
        yield
        return
    with sync_engine.begin() as c:
        tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
        c.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    login_tracker._memory_attempts.clear()
    token_blacklist._memory_bl.clear()
    yield


@pytest.fixture
def db(sync_engine):
    with Session(sync_engine, expire_on_commit=False) as s:
        yield s


@pytest.fixture
def make(db):
    return Factory(db)


class Factory:
    """Creates rows directly, so a test can set up history (old dates) the API would never produce."""

    def __init__(self, db: Session):
        self.db = db

    def _add(self, row):
        self.db.add(row)
        self.db.commit()
        return row

    def user(self, role="editor", email=None, name=None, **kw) -> User:
        n = self.db.query(User).count() + 1
        return self._add(User(email=email or f"{role}{n}@example.test", full_name=name or f"{role.title()} {n}",
                              hashed_password=_HASH, role=ROLES[role], **kw))

    def client(self, name="Sun Music", **kw) -> Client:
        return self._add(Client(name=name, name_key=name.lower().replace(" ", ""), **kw))

    def project(self, title="Kothha", kind="serial", **kw) -> Project:
        owner = kw.pop("owner", None) or self.db.query(User).first() or self.user("admin")
        return self._add(Project(title=title, type=ProjectType.MOVIE if kind == "movie" else ProjectType.SERIAL,
                                 total_episodes=kw.pop("total_episodes", 30), created_by_id=owner.id, **kw))

    def episode(self, project, number=1, status="pending", **kw) -> Episode:
        return self._add(Episode(project_id=project.id, episode_number=number, status=status, **kw))

    def cue(self, episode, title="Song", **kw) -> CueEntry:
        cue = self._add(CueEntry(episode_id=episode.id, song_title=title, duration_sec=60, usage_count=1, order_index=0, **kw))
        self._add(Contributor(cue_id=cue.id, name="Composer One", role="Composer", society="IPRS", share_percent=50))
        self._add(Contributor(cue_id=cue.id, name="Author One", role="Author", society="IPRS", share_percent=50))
        return cue

    def delegation(self, project, editor, by, client=None, **kw) -> WorkDelegation:
        return self._add(WorkDelegation(
            project_id=project.id, serial_name=project.title, assigned_to=editor.id, created_by=by.id,
            client_id=client.id if client else None, client=client.name if client else None,
            status=kw.pop("status", "pending"), **kw))

    def society(self, name="IPRS", to="iprs@example.test", attachments="iprs", **kw) -> Society:
        return self._add(Society(name=name, name_key=name.lower(), to_emails=to, attachments=attachments, **kw))

    def audit(self, user, action, episode, at: datetime) -> AuditLog:
        return self._add(AuditLog(user_id=user.id if user else None, action=action, entity="episode",
                                  entity_id=episode.id, details=action, created_at=at))


@pytest.fixture
def anon(base_client):
    return new_client(base_client)


def new_client(base) -> TestClient:
    """A separate browser (own cookies) sharing the app's event loop."""
    c = TestClient(main.app, raise_server_exceptions=False, base_url="https://testserver")
    c.portal = base.portal
    return c


@pytest.fixture
def login(base_client):
    def _login(user: User, password: str = PASSWORD) -> TestClient:
        c = new_client(base_client)
        res = c.post("/api/auth/login", data={"username": user.email, "password": password})
        assert res.status_code == 200, res.text
        return c
    return _login


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=timezone.utc)


def google_token_reply(email: str, scope: str = "openid email profile", refresh: str | None = None):
    body = {"access_token": f"access:{email}", "scope": scope}
    if refresh:
        body["refresh_token"] = refresh
    return httpx.Response(200, content=json.dumps(body), headers={"content-type": "application/json"})
