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


def send_password_reset_code(to: str, name: str, code: str, minutes: int) -> bool:
    text = (
        f"Hi {name},\n\n"
        f"Your Dayora password reset code is {code}\n\n"
        f"Enter it in the app to choose a new password. It expires in {minutes} minutes.\n"
        f"If you didn't ask for this, you can ignore this email.\n\n— Dayora"
    )
    html = f"""\
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#0a0a0a">
  <h2 style="margin:0 0 12px">Reset your password</h2>
  <p>Hi {_escape(name)}, enter this code in the Dayora app to choose a new password:</p>
  <p style="margin:24px 0;font-size:34px;font-weight:800;letter-spacing:10px;background:#f5f5f5;border-radius:12px;padding:16px;text-align:center">{code}</p>
  <p style="color:#6b6b6b;font-size:13px">The code expires in {minutes} minutes.
  If you didn't ask for this, you can ignore this email.</p>
</div>"""
    return send_email(to, f"{code} is your Dayora password reset code", text, html)


def send_verification_code(to: str, code: str, minutes: int) -> bool:
    text = (
        f"Your Dayora verification code is {code}\n\n"
        f"Enter it in the app to finish creating your account. It expires in {minutes} minutes.\n"
        f"If you didn't try to sign up, you can ignore this email.\n\n— Dayora"
    )
    html = f"""\
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#0a0a0a">
  <h2 style="margin:0 0 12px">Verify your email</h2>
  <p>Enter this code in the Dayora app to finish creating your account:</p>
  <p style="margin:24px 0;font-size:34px;font-weight:800;letter-spacing:10px;background:#f5f5f5;border-radius:12px;padding:16px;text-align:center">{code}</p>
  <p style="color:#6b6b6b;font-size:13px">The code expires in {minutes} minutes.
  If you didn't try to sign up, you can ignore this email.</p>
</div>"""
    return send_email(to, f"{code} is your Dayora verification code", text, html)


def _escape(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )
