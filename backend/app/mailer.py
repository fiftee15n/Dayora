"""Outgoing email. Uses SMTP when configured, otherwise logs the message (development)."""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("dayora.mail")


def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Send an email. Never raises: failures are logged so API requests don't break."""
    if not settings.email_enabled:
        log.warning("Email not configured (SMTP_HOST empty). Would send to %s: %s\n%s", to, subject, text)
        return False

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")

    try:
        ctx = ssl.create_default_context()
        if settings.smtp_ssl:
            server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=ctx, timeout=15)
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        with server:
            if not settings.smtp_ssl and settings.smtp_starttls:
                server.starttls(context=ctx)
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:  # pragma: no cover - network dependent
        log.exception("Failed to send email to %s", to)
        return False


def send_password_reset(to: str, name: str, link: str, minutes: int) -> bool:
    text = (
        f"Hi {name},\n\n"
        f"We received a request to reset your Dayora password. Open this link to choose a new one:\n\n"
        f"{link}\n\n"
        f"The link expires in {minutes} minutes and can be used once. "
        f"If you didn't ask for this, you can ignore this email.\n\n— Dayora"
    )
    html = f"""\
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#0f172a">
  <h2 style="margin:0 0 12px">Reset your password</h2>
  <p>Hi {_escape(name)},</p>
  <p>We received a request to reset your Dayora password.</p>
  <p style="margin:24px 0">
    <a href="{_escape(link)}" style="background:#6366F1;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Choose a new password</a>
  </p>
  <p style="color:#64748b;font-size:13px">The link expires in {minutes} minutes and can be used once.
  If you didn't ask for this, you can ignore this email.</p>
</div>"""
    return send_email(to, "Reset your Dayora password", text, html)


def _escape(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )
