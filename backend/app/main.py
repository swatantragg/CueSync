import asyncio
import re
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import orjson
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.router import api_router
from app.core.config import settings
from app.core.database import Base, engine
import app.models.work_delegation       # noqa: F401
import app.models.notification           # noqa: F401
import app.models.society_submission     # noqa: F401
import app.models.work_file              # noqa: F401
import app.models.client                 # noqa: F401
import app.models.society                # noqa: F401
import app.models.detected_mail          # noqa: F401
import app.models.user_mailbox           # noqa: F401
import app.models.editor_notice          # noqa: F401
import app.models.report_send            # noqa: F401
import app.models.conversion             # noqa: F401
from app.services.library_sync import (
    cleanup_contributor_duplicates,
    cleanup_cue_contributor_duplicates,
    cleanup_song_duplicates,
    normalize_library_contributors_json,
)
from app.services.super_admin import ensure_super_admin

_CORS_RE = re.compile(r"http://(?:localhost|127\.0\.0\.1)(?::\d+)?")

MIGRATIONS = [
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS country VARCHAR(100)",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_episodes INTEGER",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS bg_music_composer VARCHAR(255)",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS air_date VARCHAR(50)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_serial_title VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_channel VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_serial_type VARCHAR(50)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_language VARCHAR(100)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_director VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_genre VARCHAR(100)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_production_company VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_country VARCHAR(100)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_actors TEXT",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_producer VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_production_year INTEGER",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_bg_music_composer VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_submitted_by VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' NOT NULL",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rejection_note TEXT",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS review_note TEXT",
    "ALTER TABLE cue_entries ADD COLUMN IF NOT EXISTS singer VARCHAR(255)",
    "ALTER TABLE cue_entries ADD COLUMN IF NOT EXISTS library_id INTEGER REFERENCES song_library(id) ON DELETE SET NULL",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS singer VARCHAR(255)",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS contributors_json TEXT",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS alt_titles TEXT",
    "ALTER TABLE contributor_library ADD COLUMN IF NOT EXISTS alt_names TEXT",
    "CREATE INDEX IF NOT EXISTS ix_member_pa_name ON member_directory(pa_name)",
    "CREATE INDEX IF NOT EXISTS ix_member_ipi ON member_directory(ipi_number)",
    "ALTER TABLE song_library DROP CONSTRAINT IF EXISTS song_library_title_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_song_library_isrc ON song_library(isrc) WHERE isrc IS NOT NULL",
    "SELECT setval('projects_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM projects), 1))) FROM projects_id_seq",
    "SELECT setval('episodes_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM episodes), 1))) FROM episodes_id_seq",
    "SELECT setval('cue_entries_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM cue_entries), 1))) FROM cue_entries_id_seq",
    "SELECT setval('song_library_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM song_library), 1))) FROM song_library_id_seq",
    "SELECT setval('contributor_library_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM contributor_library), 1))) FROM contributor_library_id_seq",
    "SELECT setval('member_directory_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM member_directory), 1))) FROM member_directory_id_seq",
    # IPRS tracking columns on society_submissions
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS submitted_to_iprs BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS submitted_to_iprs_at TIMESTAMPTZ",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS accepted_by_iprs BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS accepted_by_iprs_at TIMESTAMPTZ",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS followup_count INTEGER DEFAULT 0 NOT NULL",
    # Client list: delegations and submissions point at a client instead of free text
    "ALTER TABLE work_delegations ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL",
    "CREATE INDEX IF NOT EXISTS ix_work_delegations_client_id ON work_delegations(client_id)",
    "CREATE INDEX IF NOT EXISTS ix_society_submissions_client_id ON society_submissions(client_id)",
    # Send to Society: the email sent from the client's Gmail
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS society_id INTEGER REFERENCES societies(id) ON DELETE SET NULL",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS society_name VARCHAR(100)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS sent_via VARCHAR(20)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_from VARCHAR(255)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_to TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_cc TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_bcc TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_subject TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_body TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_attachments TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS gmail_message_id VARCHAR(100)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS gmail_thread_id VARCHAR(100)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_sent_at TIMESTAMPTZ",
    "CREATE INDEX IF NOT EXISTS ix_society_submissions_society_id ON society_submissions(society_id)",
    # Reply / bounce tracking (services/mail_sync)
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_status VARCHAR(20)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_watch_from TIMESTAMPTZ",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS mail_checked_at TIMESTAMPTZ",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS reply_at TIMESTAMPTZ",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS reply_from VARCHAR(255)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS reply_subject TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS reply_snippet TEXT",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS reply_message_id VARCHAR(100)",
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS bounce_reason TEXT",
    "UPDATE society_submissions SET mail_status = 'sent', mail_watch_from = mail_sent_at WHERE sent_via = 'gmail' AND mail_status IS NULL",
    "ALTER TABLE client_mailboxes ADD COLUMN IF NOT EXISTS last_sent_scan_at TIMESTAMPTZ",
    # Conversion: the email carried sheets converted from an uploaded file, not approved episodes
    "ALTER TABLE society_submissions ADD COLUMN IF NOT EXISTS from_conversion BOOLEAN DEFAULT FALSE NOT NULL",
]

# Users columns. Run in autocommit (not inside MIGRATIONS' shared transaction) because every
# users query selects these columns. Hidden super admin — at most one row may carry the flag.
USER_MIGRATIONS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_users_single_super_admin ON users(is_super_admin) WHERE is_super_admin",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE NOT NULL",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_version VARCHAR(20)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_report_enabled BOOLEAN DEFAULT TRUE NOT NULL",
    "CREATE INDEX IF NOT EXISTS ix_audit_logs_action ON audit_logs(action)",
]

# ── IPRS followup background task ─────────────────────────────────────────────

async def _send_followup_notifications() -> None:
    """
    Run every hour. For each SocietySubmission:
    - If NOT submitted_to_iprs AND created > 3 weeks ago → notify to submit to IPRS
    - If submitted_to_iprs AND NOT accepted_by_iprs AND submitted_to_iprs_at > 3 weeks ago → followup
    Both: re-notify every week after the first notification.
    Notifies all admin, reviewer, and work_delegator users.
    """
    from app.models.notification import Notification
    from app.models.project import Project
    from app.models.society_submission import SocietySubmission
    from app.models.user import User
    from app.services.society_mail import not_dead  # bounced emails wait for a resend, not the society

    THREE_WEEKS = timedelta(weeks=3)
    ONE_WEEK    = timedelta(weeks=1)
    now         = datetime.now(timezone.utc)

    try:
        async with AsyncSession(engine) as db:
            async with db.begin():
                target_users = (await db.execute(
                    select(User).where(User.role.in_(["admin", "reviewer", "work_delegator"]))
                )).scalars().all()
                if not target_users:
                    return

                subs = (await db.execute(
                    select(SocietySubmission).where(SocietySubmission.accepted_by_iprs == False, not_dead)
                )).scalars().all()

                for sub in subs:
                    proj = await db.get(Project, sub.project_id)
                    if not proj:
                        continue

                    sub_at    = sub.submitted_at.replace(tzinfo=timezone.utc) if sub.submitted_at else None
                    iprs_at   = sub.submitted_to_iprs_at.replace(tzinfo=timezone.utc) if sub.submitted_to_iprs_at else None
                    follow_at = sub.last_followup_at.replace(tzinfo=timezone.utc) if sub.last_followup_at else None

                    needs_notif   = False
                    is_first      = follow_at is None
                    weekly_due    = follow_at is not None and (now - follow_at) >= ONE_WEEK

                    ep_range = (
                        f"Ep {sub.episode_from}–{sub.episode_to}"
                        if sub.episode_from != sub.episode_to
                        else f"Ep {sub.episode_from}"
                    )

                    if not sub.submitted_to_iprs:
                        if sub_at and (now - sub_at) >= THREE_WEEKS and (is_first or weekly_due):
                            needs_notif = True
                            title = f"Action Required: Submit to IPRS — {proj.title}"
                            body  = (
                                f"{ep_range} was logged {sub.followup_count + 1 if sub.followup_count else 1} "
                                f"week(s) ago but has not been submitted to IPRS. Please submit immediately."
                            )
                    else:
                        if iprs_at and (now - iprs_at) >= THREE_WEEKS and (is_first or weekly_due):
                            needs_notif = True
                            title = f"IPRS Followup Required — {proj.title}"
                            body  = (
                                f"{ep_range} was submitted to IPRS but acceptance has not been confirmed. "
                                f"Please follow up with IPRS. (Followup #{sub.followup_count + 1})"
                            )

                    if needs_notif:
                        for user in target_users:
                            db.add(Notification(
                                user_id=user.id, title=title, body=body,
                                entity_type="society_submission", entity_id=sub.id,
                            ))
                        sub.last_followup_at = now
                        sub.followup_count   = (sub.followup_count or 0) + 1

        print(f"[followup-task] checked {len(subs) if 'subs' in dir() else 0} submissions at {now.isoformat()}")
    except Exception as exc:
        print(f"[followup-task] error: {exc}")


async def _check_client_mailboxes() -> None:
    """Daily check that every connected client Gmail still works; flags the ones to reconnect."""
    from app.services.clients import check_due_mailboxes

    try:
        async with AsyncSession(engine) as db:
            async with db.begin():
                checked = await check_due_mailboxes(db)
        if checked:
            print(f"[mailbox-check] checked {checked} client mailbox(es)")
    except Exception as exc:
        print(f"[mailbox-check] error: {exc}")


async def _sync_society_mail() -> None:
    """Read connected client Gmails for society replies, bounces and emails sent outside CueSync."""
    from app.services.mail_sync import sync_all

    try:
        async with AsyncSession(engine) as db:
            async with db.begin():
                result = await sync_all(db)
        if result and (result["replies"] or result["bounces"] or result["detected"] or result["errors"]):
            print(f"[mail-sync] {result}")
    except Exception as exc:
        print(f"[mail-sync] error: {exc}")


async def _mail_sync_loop() -> None:
    await asyncio.sleep(90)
    while True:
        await _sync_society_mail()
        await asyncio.sleep(max(1, settings.MAIL_SYNC_MINUTES) * 60)


async def _weekly_report_loop() -> None:
    from app.services.weekly_reports import run_if_due

    await asyncio.sleep(120)
    while True:
        try:
            await run_if_due(engine)
        except Exception as exc:
            print(f"[weekly-reports] error: {exc!r}")
        await asyncio.sleep(300)


async def _followup_loop() -> None:
    await asyncio.sleep(60)  # small initial delay to let DB settle
    while True:
        await _send_followup_notifications()
        await _check_client_mailboxes()
        await asyncio.sleep(3600)  # check every hour


# Use lowercase values to match Python enum .value ("reviewer", not "REVIEWER")
USER_ROLE_ENUM_VALUES = ["work_delegator", "reviewer"]
USAGE_TYPE_ENUM_VALUES = ["BI", "BV", "FI", "FV"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ac_engine = engine.execution_options(isolation_level="AUTOCOMMIT")
        for val in USER_ROLE_ENUM_VALUES:
            try:
                async with ac_engine.connect() as conn:
                    await conn.execute(text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{val}'"))
                print(f"[enum-migration] ensured userrole value: {val}")
            except Exception as me:
                print(f"[enum-migration] skipped '{val}': {me}")
        for val in USAGE_TYPE_ENUM_VALUES:
            try:
                async with ac_engine.connect() as conn:
                    await conn.execute(text(f"ALTER TYPE usagetype ADD VALUE IF NOT EXISTS '{val}'"))
                print(f"[enum-migration] ensured usagetype value: {val}")
            except Exception as me:
                print(f"[enum-migration] skipped '{val}': {me}")

        # Convert users.role from native PostgreSQL enum to varchar (matches native_enum=False).
        # Idempotent: only runs if the column is still the userrole enum type.
        try:
            async with ac_engine.connect() as conn:
                await conn.execute(text("""
                    DO $$ BEGIN
                      IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='users' AND column_name='role' AND udt_name='userrole'
                      ) THEN
                        ALTER TABLE users ALTER COLUMN role TYPE varchar(50) USING role::varchar;
                      END IF;
                    END $$;
                """))
            print("[enum-migration] converted users.role to varchar(50)")
        except Exception as me:
            print(f"[enum-migration] role column conversion skipped: {me}")

        # Normalize ALL uppercase role values (old DB stored them as enum names, not values).
        # Runs in autocommit so it's independent of the main migration transaction.
        _role_map = [
            ("ADMIN", "admin"), ("EDITOR", "editor"), ("VIEWER", "viewer"),
            ("REVIEWER", "reviewer"), ("WORK_DELEGATOR", "work_delegator"),
        ]
        try:
            async with ac_engine.connect() as conn:
                for old_val, new_val in _role_map:
                    await conn.execute(text(f"UPDATE users SET role = '{new_val}' WHERE role = '{old_val}'"))
            print("[enum-migration] normalized user role casing")
        except Exception as me:
            print(f"[enum-migration] role normalization skipped: {me}")

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for sql in MIGRATIONS:
                try:
                    await conn.execute(text(sql))
                except Exception as me:
                    print(f"[migration] skipped: {me}")
        print("[startup] DB connected, tables ensured")
        for sql in USER_MIGRATIONS:
            try:
                async with ac_engine.connect() as conn:
                    await conn.execute(text(sql))
            except Exception as me:
                print(f"[migration] skipped: {me}")
        try:
            async with AsyncSession(engine) as db:
                async with db.begin():
                    print(f"[startup] super admin: {await ensure_super_admin(db)}")
        except Exception as se:
            print(f"[startup] super admin setup skipped: {se}")
        try:
            async with AsyncSession(engine) as db:
                async with db.begin():
                    s = await cleanup_song_duplicates(db)
                    c = await cleanup_contributor_duplicates(db)
                    cu = await cleanup_cue_contributor_duplicates(db)
                    lj = await normalize_library_contributors_json(db)
                    print(f"[startup] dedup: {s} songs, {c} contributors, {cu} cue-contribs, {lj} library-json rows cleaned")
        except Exception as de:
            print(f"[startup] dedup skipped: {de}")
    except Exception as e:
        print(f"[startup] DB unavailable — API will run without DB. Error: {e}")

    followup_task = asyncio.create_task(_followup_loop())
    mail_sync_task = asyncio.create_task(_mail_sync_loop())
    report_task = asyncio.create_task(_weekly_report_loop())
    try:
        yield
    finally:
        followup_task.cancel()
        mail_sync_task.cancel()
        report_task.cancel()
        await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="4.1.2",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    # Disable automatic debug info exposure in OpenAPI errors
    debug=False,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
_cors_kwargs: dict = dict(
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition", "X-Work-Files", "X-Episodes"],
)
if settings.APP_ENV != "production":
    _cors_kwargs["allow_origin_regex"] = r"http://localhost:\d+"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(api_router)


# ── Body size limit ────────────────────────────────────────────────────────────
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.max_body_size_bytes:
                return JSONResponse(status_code=413, content={"detail": "Request body too large"})
        except ValueError:
            pass
    return await call_next(request)


# ── Security headers ───────────────────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── CORS safety net (keeps headers on unhandled exception paths) ───────────────
@app.middleware("http")
async def cors_safety_net(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin", "")
    if origin and (origin in settings.cors_list or _CORS_RE.fullmatch(origin)):
        if "access-control-allow-origin" not in response.headers:
            response.headers["access-control-allow-origin"] = origin
            response.headers["access-control-allow-credentials"] = "true"
            response.headers["vary"] = "Origin"
    return response


# ── Unhandled-error handler (attaches CORS headers so browsers see the real ────
#    error instead of a generic "Failed to fetch") ──────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    print(f"[error] {request.method} {request.url.path}: {exc!r}")
    headers = {}
    origin = request.headers.get("origin", "")
    if origin and (origin in settings.cors_list or _CORS_RE.fullmatch(origin)):
        headers["access-control-allow-origin"] = origin
        headers["access-control-allow-credentials"] = "true"
        headers["vary"] = "Origin"
    return JSONResponse(status_code=500, content={"detail": "Internal server error"}, headers=headers)


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
