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

    # Set to false to disable public self-registration
    ALLOW_PUBLIC_SIGNUP: bool = True

    # Maximum request body size in MB (excludes file uploads handled by Nginx)
    MAX_BODY_SIZE_MB: int = 10

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
