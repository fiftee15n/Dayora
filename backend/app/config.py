from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Dayora API"
    app_env: str = "development"
    database_url: str = "sqlite:///./dayora.db"

    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    cors_origins: str = ""  # only needed for browser clients
    cookie_name: str = "dayora_token"
    cookie_secure: bool = False

    upload_dir: str = "uploads"
    max_avatar_bytes: int = 2 * 1024 * 1024

    # Password reset codes (6 digits, emailed).
    reset_token_expire_minutes: int = 30

    # Outgoing email (optional). When SMTP_HOST is empty, emails are logged instead of sent.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Dayora <no-reply@dayora.app>"
    smtp_starttls: bool = True
    smtp_ssl: bool = False

    # Sign-up email verification (6-digit code).
    verification_code_expire_minutes: int = 10
    verification_max_attempts: int = 5
    verification_resend_seconds: int = 60

    # Google sign-in: comma-separated OAuth client IDs whose ID tokens are accepted
    # (the "Web application" client ID used as webClientId in the app). Empty disables it.
    google_client_ids: str = ""

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() in {"development", "dev", "test"}

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host)

    @property
    def google_client_id_list(self) -> list[str]:
        return [c.strip() for c in self.google_client_ids.split(",") if c.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


_WEAK_SECRETS = {"change-me", "change-this-to-a-long-random-string", ""}


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.is_dev and (s.jwt_secret in _WEAK_SECRETS or len(s.jwt_secret) < 32):
        raise RuntimeError(
            "JWT_SECRET must be set to a random string of at least 32 characters outside development."
        )
    return s


settings = get_settings()
