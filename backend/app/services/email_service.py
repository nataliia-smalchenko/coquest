import resend
from app.config import settings
from datetime import datetime, timedelta, timezone
import secrets
import asyncio

resend.api_key = settings.RESEND_API_KEY


class EmailService:
    @staticmethod
    def generate_verification_token() -> str:
        """Generate secure verification token"""
        return secrets.token_urlsafe(32)

    @staticmethod
    def is_token_expired(sent_at: datetime, hours: int = 24) -> bool:
        """Check if verification token expired"""
        if not sent_at:
            return True

        # Ensure sent_at has timezone info if it's missing (naive to aware)
        if sent_at.tzinfo is None:
            sent_at = sent_at.replace(tzinfo=timezone.utc)

        now = datetime.now(timezone.utc)
        return now - sent_at > timedelta(hours=hours)

    @staticmethod
    async def _send_email_task(params: dict):
        """Helper to run synchronous Resend call in a separate thread"""
        # Since resend-python is sync, we use to_thread to avoid blocking FastAPI
        return await asyncio.to_thread(resend.Emails.send, params)

    @staticmethod
    async def send_verification_email(email: str, full_name: str, token: str):
        """Send email verification"""
        verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #4F46E5; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 20px 0; }}
                .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Вітаємо в CoQuest!</h1>
                </div>
                <div class="content">
                    <h2>Привіт, {full_name}!</h2>
                    <p>Дякуємо за реєстрацію в CoQuest. Будь ласка, підтвердіть вашу електронну адресу, щоб активувати акаунт.</p>
                    
                    <a href="{verification_url}" class="button">Підтвердити Email</a>
                    
                    <p>Або скопіюйте це посилання в браузер:</p>
                    <p style="word-break: break-all; color: #666;">{verification_url}</p>
                    
                    <p style="margin-top: 30px; color: #666; font-size: 14px;">
                        Це посилання дійсне протягом 24 годин.
                    </p>
                    
                    <p style="color: #999; font-size: 12px;">
                        Якщо ви не реєструвались на CoQuest, проігноруйте цей лист.
                    </p>
                </div>
                <div class="footer">
                    <p>© 2025 CoQuest. Всі права захищені.</p>
                </div>
            </div>
        </body>
        </html>
        """

        try:
            params = {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [email],
                "subject": "Підтвердіть вашу електронну адресу - CoQuest",
                "html": html_content,
            }

            return await EmailService._send_email_task(params)
        except Exception as e:
            print(f"Error sending email: {e}")
            raise

    @staticmethod
    async def send_welcome_email(email: str, full_name: str):
        """Send welcome email after verification"""
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Email підтверджено!</h1>
                </div>
                <div class="content">
                    <h2>Привіт, {full_name}!</h2>
                    <p>Ваш акаунт успішно активовано. Тепер ви можете користуватись всіма можливостями CoQuest!</p>
                    
                    <p><strong>Що далі?</strong></p>
                    <ul>
                        <li>Створіть свій перший квест</li>
                        <li>Запросіть колег або студентів</li>
                        <li>Досліджуйте готові квести</li>
                    </ul>
                    
                    <p>Бажаємо продуктивної роботи! 🚀</p>
                </div>
            </div>
        </body>
        </html>
        """

        try:
            params = {
                "from": settings.RESEND_FROM_EMAIL,
                "to": [email],
                "subject": "Ласкаво просимо в CoQuest! 🎉",
                "html": html_content,
            }

            return await EmailService._send_email_task(params)
        except Exception as e:
            print(f"Error sending welcome email: {e}")
