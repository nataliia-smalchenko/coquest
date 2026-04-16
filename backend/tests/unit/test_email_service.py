import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, AsyncMock, MagicMock

from app.services.email_service import EmailService


class TestGenerateVerificationToken:
    def test_returns_string(self):
        token = EmailService.generate_verification_token()
        assert isinstance(token, str)

    def test_token_has_sufficient_length(self):
        token = EmailService.generate_verification_token()
        # token_urlsafe(32) produces ~43 chars
        assert len(token) >= 32

    def test_tokens_are_unique(self):
        tokens = {EmailService.generate_verification_token() for _ in range(20)}
        assert len(tokens) == 20


class TestIsTokenExpired:
    def test_not_expired_when_recent(self):
        sent_at = datetime.now(timezone.utc) - timedelta(hours=1)
        assert EmailService.is_token_expired(sent_at) is False

    def test_expired_when_old(self):
        sent_at = datetime.now(timezone.utc) - timedelta(hours=25)
        assert EmailService.is_token_expired(sent_at) is True

    def test_returns_true_when_sent_at_is_none(self):
        assert EmailService.is_token_expired(None) is True

    def test_exactly_at_boundary_not_expired(self):
        # Just under 24 hours ago
        sent_at = datetime.now(timezone.utc) - timedelta(hours=23, minutes=59)
        assert EmailService.is_token_expired(sent_at) is False

    def test_exactly_at_boundary_expired(self):
        # Just over 24 hours ago
        sent_at = datetime.now(timezone.utc) - timedelta(hours=24, seconds=1)
        assert EmailService.is_token_expired(sent_at) is True

    def test_custom_hours(self):
        sent_at = datetime.now(timezone.utc) - timedelta(hours=3)
        assert EmailService.is_token_expired(sent_at, hours=2) is True
        assert EmailService.is_token_expired(sent_at, hours=4) is False

    def test_naive_datetime_treated_as_utc(self):
        # Naive datetime (no tzinfo) should be treated as UTC
        sent_at = datetime.now().replace(tzinfo=None) - timedelta(hours=1)  # naive datetime, no tzinfo
        assert EmailService.is_token_expired(sent_at) is False


class TestSendEmailTask:
    @pytest.mark.asyncio
    async def test_calls_resend_emails_send(self):
        params = {"from": "a@b.com", "to": ["c@d.com"], "subject": "Test", "html": "<p>Hi</p>"}
        with patch("app.services.email_service.resend.Emails.send", return_value={"id": "abc"}) as mock_send:
            result = await EmailService._send_email_task(params)
        mock_send.assert_called_once_with(params)
        assert result == {"id": "abc"}


class TestSendVerificationEmail:
    @pytest.mark.asyncio
    async def test_sends_email_with_correct_params(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {"id": "123"}
            result = await EmailService.send_verification_email(
                email="user@example.com",
                full_name="Test User",
                token="abc123",
                language="uk",
            )

        mock_send.assert_called_once()
        call_params = mock_send.call_args[0][0]
        assert call_params["to"] == ["user@example.com"]
        assert "abc123" in call_params["html"]
        assert call_params["subject"]

    @pytest.mark.asyncio
    async def test_sends_in_english(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {"id": "456"}
            await EmailService.send_verification_email(
                email="user@example.com",
                full_name="Test User",
                token="tok",
                language="en",
            )

        call_params = mock_send.call_args[0][0]
        assert call_params["to"] == ["user@example.com"]

    @pytest.mark.asyncio
    async def test_raises_on_send_failure(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.side_effect = Exception("SMTP error")
            with pytest.raises(Exception, match="SMTP error"):
                await EmailService.send_verification_email(
                    email="user@example.com",
                    full_name="Test User",
                    token="tok",
                )

    @pytest.mark.asyncio
    async def test_verification_url_contains_token_and_language(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {}
            await EmailService.send_verification_email(
                email="u@e.com",
                full_name="Name",
                token="MY_TOKEN",
                language="en",
            )

        call_params = mock_send.call_args[0][0]
        assert "MY_TOKEN" in call_params["html"]
        assert "en" in call_params["html"]


class TestSendWelcomeEmail:
    @pytest.mark.asyncio
    async def test_sends_welcome_email(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {"id": "789"}
            await EmailService.send_welcome_email(
                email="user@example.com",
                full_name="Welcome User",
                language="uk",
            )

        mock_send.assert_called_once()
        call_params = mock_send.call_args[0][0]
        assert call_params["to"] == ["user@example.com"]
        assert call_params["subject"]
        assert "<html" in call_params["html"].lower() or len(call_params["html"]) > 0

    @pytest.mark.asyncio
    async def test_sends_welcome_email_in_english(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {}
            await EmailService.send_welcome_email(
                email="user@example.com",
                full_name="Name",
                language="en",
            )

        mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_does_not_raise_on_send_failure(self):
        """send_welcome_email swallows exceptions (fire-and-forget)."""
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.side_effect = Exception("network error")
            # Should not raise
            await EmailService.send_welcome_email(
                email="user@example.com",
                full_name="Test",
                language="uk",
            )

    @pytest.mark.asyncio
    async def test_uses_default_language(self):
        with patch.object(EmailService, "_send_email_task", new_callable=AsyncMock) as mock_send:
            mock_send.return_value = {}
            await EmailService.send_welcome_email(email="u@e.com", full_name="N")

        mock_send.assert_called_once()
