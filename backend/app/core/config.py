from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "CueSync"
    APP_ENV: str = "development"
    DEBUG: bool = False

    DATABASE_URL: str
    SYNC_DATABASE_URL: str

    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    CORS_ORIGINS: str = "http://localhost:5173"

    # Redis for token blacklist (optional — falls back to in-memory if not set)
    REDIS_URL: str | None = None

    # The single hidden super admin. Promoted at startup if the account exists; created with
    # SUPER_ADMIN_PASSWORD if it doesn't (skipped when no password is configured).
    SUPER_ADMIN_EMAIL: str = "swatantra.goongoonalo@gmail.com"
    SUPER_ADMIN_PASSWORD: str | None = None

    # Maximum request body size in MB (excludes file uploads handled by Nginx)
    MAX_BODY_SIZE_MB: int = 10

    # Client Gmail connections (Google OAuth). The callback lives on the API host; FRONTEND_URL is
    # where people open CueSync — the callback page reports back to it and links to it.
    FRONTEND_URL: str = "http://localhost:5173"
    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/mail/oauth/callback"
    # Fernet key that encrypts stored Gmail refresh tokens. Changing it disconnects every mailbox.
    MAIL_TOKEN_KEY: str | None = None
    # How often connected client Gmails are read for society replies, bounces and hand-sent emails.
    MAIL_SYNC_MINUTES: int = 10

    # Weekly email reports through Brevo (services/weekly_reports.py). Off until REPORT_ENABLED is true.
    # The sender must be verified in Brevo; a gmail.com address can't be authenticated there, so use one on your domain.
    BREVO_API_KEY: str | None = None
    BREVO_SENDER_EMAIL: str | None = None
    BREVO_SENDER_NAME: str = "CueSync Reports"
    BREVO_REPLY_TO: str | None = None    # where replies go, e.g. the admin's own mailbox
    REPORT_ENABLED: bool = False
    REPORT_DAY: str = "monday"           # monday … sunday
    REPORT_TIME: str = "09:00"           # 24-hour HH:MM in REPORT_TIMEZONE
    REPORT_TIMEZONE: str = "Asia/Kolkata"

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        normalized = str(value).strip().lower()
        if normalized in {"1", "true", "yes", "on", "debug", "dev", "development"}:
            return True
        if normalized in {"0", "false", "no", "off", "release", "prod", "production"}:
            return False
        return bool(normalized)

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def max_body_size_bytes(self) -> int:
        return self.MAX_BODY_SIZE_MB * 1024 * 1024


settings = Settings()
