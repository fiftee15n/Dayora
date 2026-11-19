"""Entry point so `uvicorn main:app` works from the backend folder.

The application itself lives in the `app` package (app/main.py); this just re-exports it.
"""
from app.main import app

__all__ = ["app"]
