import secrets
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog
import resend
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config import settings
from app.services.i18n_service import I18nService

log = structlog.get_logger(__name__)

resend.api_key = settings.RESEND_API_KEY

# Setup Jinja2 for email templates
templates_dir = Path(__file__).parent.parent / "templates" / "emails"
jinja_env = Environment(
    loader=FileSystemLoader(templates_dir),
    autoescape=select_autoescape(["html", "xml"]),
)


class EmailService:
    @staticmethod
    def generate_verification_token() -> str:
        """Generate secure verification token"""
        return secrets.token_urlsafe(32)

    @staticmethod
    def is_token_expired(sent_at: datetime, hours: int = 24) -> bool:
        """Check if verification token expired (timezone aware)"""
        if not sent_at:
            return True

        # Ensure sent_at has timezone info if it's missing (naive to aware)
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        return now - sent_at > timedelta(hours=hours)

    @staticmethod
    async def _send_email_task(params: dict):
        """Helper to run synchronous Resend call in a separate thread to prevent blocking FastAPI"""
        return await asyncio.to_thread(resend.Emails.send, params)

    @staticmethod
    async def send_verification_email(
        email: str, full_name: str, token: str, language: str = "uk"
    ):
        """Send email verification with i18n support"""

        verification_url = (
            f"{settings.FRONTEND_URL}/{language}/verify-email?token={token}"
        )

        # Local helper function instead of assigned lambda (PEP 8 compliant)
        def t(key: str, **kwargs) -> str:
            return I18nService.get_translation(
                language, "emails", f"verification.{key}", **kwargs
            )

        # Load and render template
        template = jinja_env.get_template("verification.html")
        html_content = template.render(
            lang=language,
            name=full_name,
            verification_url=verification_url,
            title=t("title"),
            greeting=t("greeting", name=full_name),
            message=t("message"),
            button=t("button"),
            or_copy=t("or_copy"),
            valid_for=t("valid_for"),
            ignore=t("ignore"),
            footer=t("footer"),
        )

        try:
            params = {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [email],
                "subject": t("subject"),
                "html": html_content,
            }

            return await EmailService._send_email_task(params)
        except Exception:
            log.error("verification_email_failed", email=email, exc_info=True)
            raise

    @staticmethod
    async def send_welcome_email(email: str, full_name: str, language: str = "uk"):
        """Send welcome email after verification with i18n support"""

        # Local helper function instead of assigned lambda (PEP 8 compliant)
        def t(key: str, **kwargs) -> str:
            return I18nService.get_translation(
                language, "emails", f"welcome.{key}", **kwargs
            )

        template = jinja_env.get_template("welcome.html")
        html_content = template.render(
            lang=language,
            name=full_name,
            title=t("title"),
            greeting=t("greeting", name=full_name),
            message=t("message"),
            next_steps=t("next_steps"),
            step1=t("step1"),
            step2=t("step2"),
            step3=t("step3"),
            closing=t("closing"),
            footer=I18nService.get_translation(
                language, "emails", "verification.footer"
            ),
        )

        try:
            params = {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [email],
                "subject": t("subject"),
                "html": html_content,
            }

            return await EmailService._send_email_task(params)
        except Exception:
            log.error("welcome_email_failed", email=email, exc_info=True)
