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

    cors_origins: str = "http://localhost:3000"
    cookie_name: str = "dayora_token"
    cookie_secure: bool = False

    upload_dir: str = "uploads"
    max_avatar_bytes: int = 2 * 1024 * 1024

    @property
    def is_dev(self) -> bool:
        return self.app_env.lower() in {"development", "dev", "test"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
