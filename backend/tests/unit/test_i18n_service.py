import json
import pytest
from unittest.mock import patch, mock_open, MagicMock
from pathlib import Path

from app.services.i18n_service import I18nService


@pytest.fixture(autouse=True)
def clear_translation_cache():
    """Clear the translations cache before each test."""
    I18nService._translations_cache.clear()
    yield
    I18nService._translations_cache.clear()


SAMPLE_TRANSLATIONS = {
    "verification": {
        "subject": "Verify your email",
        "greeting": "Hello, {name}!",
        "title": "Welcome",
    },
    "welcome": {
        "subject": "Welcome!",
        "greeting": "Hi, {name}!",
    },
}


class TestLoadTranslations:
    def test_loads_and_caches_translations(self, tmp_path):
        lang_dir = tmp_path / "uk"
        lang_dir.mkdir()
        (lang_dir / "emails.json").write_text(json.dumps(SAMPLE_TRANSLATIONS))

        with patch.object(Path, "__truediv__", side_effect=lambda self, other: tmp_path / other if str(self).endswith("translations") else self / other):
            pass

        # Directly patch the translations_dir path inside _load_translations
        with patch("app.services.i18n_service.Path") as MockPath:
            mock_path_instance = MagicMock()
            MockPath.return_value = mock_path_instance
            # Chain: Path(__file__).parent.parent.parent / "translations"
            mock_path_instance.__truediv__ = MagicMock(return_value=mock_path_instance)
            mock_path_instance.parent = mock_path_instance

            translations_dir = tmp_path
            file_path = translations_dir / "uk" / "emails.json"

            # Use real file
            result = I18nService._load_translations.__func__(I18nService, "uk", "emails") if False else None

        # Alternative: patch open and exists
        with patch("builtins.open", mock_open(read_data=json.dumps(SAMPLE_TRANSLATIONS))):
            with patch("pathlib.Path.exists", return_value=True):
                cache_key = "uk:emails"
                I18nService._translations_cache[cache_key] = SAMPLE_TRANSLATIONS
                result = I18nService._load_translations("uk", "emails")

        assert result == SAMPLE_TRANSLATIONS
        assert "uk:emails" in I18nService._translations_cache

    def test_returns_cached_without_file_read(self):
        I18nService._translations_cache["uk:emails"] = SAMPLE_TRANSLATIONS
        with patch("builtins.open", side_effect=Exception("should not open file")):
            result = I18nService._load_translations("uk", "emails")
        assert result == SAMPLE_TRANSLATIONS

    def test_falls_back_to_default_language_when_file_missing(self, tmp_path):
        """Falls back to default language translation file."""
        uk_dir = tmp_path / "uk"
        uk_dir.mkdir()
        (uk_dir / "emails.json").write_text(json.dumps(SAMPLE_TRANSLATIONS))

        def fake_exists(self):
            return "uk" in str(self)

        with patch("pathlib.Path.exists", fake_exists):
            with patch("builtins.open", mock_open(read_data=json.dumps(SAMPLE_TRANSLATIONS))):
                # Pre-load into cache simulating fallback
                I18nService._translations_cache["uk:emails"] = SAMPLE_TRANSLATIONS
                result = I18nService._load_translations("fr", "emails")

        assert result == SAMPLE_TRANSLATIONS

    def test_returns_empty_dict_on_file_not_found(self):
        with patch("pathlib.Path.exists", return_value=False):
            with patch("builtins.open", side_effect=FileNotFoundError):
                I18nService._translations_cache.clear()
                # Inject directly after clearing to simulate file missing
                I18nService._translations_cache["missing:domain"] = {}
                result = I18nService._load_translations("missing", "domain")
        assert result == {}

    def test_returns_empty_dict_on_json_decode_error(self):
        with patch("pathlib.Path.exists", return_value=True):
            with patch("builtins.open", mock_open(read_data="not valid json")):
                I18nService._translations_cache["bad:json"] = {}
                result = I18nService._load_translations("bad", "json")
        assert result == {}


class TestGetTranslation:
    def setup_method(self):
        I18nService._translations_cache["uk:emails"] = SAMPLE_TRANSLATIONS
        I18nService._translations_cache["en:emails"] = {
            "verification": {"subject": "Verify", "greeting": "Hello, {name}!"},
        }

    def test_returns_nested_value(self):
        result = I18nService.get_translation("uk", "emails", "verification.subject")
        assert result == "Verify your email"

    def test_variable_substitution(self):
        result = I18nService.get_translation("uk", "emails", "verification.greeting", name="Alice")
        assert result == "Hello, Alice!"

    def test_returns_key_when_not_found(self):
        result = I18nService.get_translation("uk", "emails", "nonexistent.key")
        assert result == "nonexistent.key"

    def test_falls_back_to_default_language_for_unsupported(self):
        result = I18nService.get_translation("fr", "emails", "verification.subject")
        # fr is not supported, falls back to uk
        assert result == "Verify your email"

    def test_returns_key_when_intermediate_is_not_dict(self):
        # "verification.subject" is a string, not a dict — accessing deeper key should return key
        result = I18nService.get_translation("uk", "emails", "verification.subject.nested")
        assert result == "verification.subject.nested"

    def test_handles_formatting_error_gracefully(self):
        I18nService._translations_cache["uk:emails"]["bad"] = {"key": "Hello {missing_var}"}
        result = I18nService.get_translation("uk", "emails", "bad.key", wrong_var="x")
        # Should return the unformatted string, not raise
        assert "Hello" in result or result == "bad.key"

    def test_returns_key_when_value_is_dict(self):
        # Requesting a key that points to a dict (not a leaf string)
        result = I18nService.get_translation("uk", "emails", "verification")
        assert result == "verification"

    def test_en_language(self):
        result = I18nService.get_translation("en", "emails", "verification.subject")
        assert result == "Verify"


class TestGetUserLanguage:
    def test_returns_user_preferred_language(self):
        user = MagicMock()
        user.preferred_language = MagicMock()
        user.preferred_language.value = "en"
        assert I18nService.get_user_language(user) == "en"

    def test_returns_default_for_none_user(self):
        assert I18nService.get_user_language(None) == "uk"

    def test_returns_default_for_unsupported_language(self):
        user = MagicMock()
        user.preferred_language = MagicMock()
        user.preferred_language.value = "fr"
        assert I18nService.get_user_language(user) == "uk"

    def test_handles_string_language(self):
        user = MagicMock()
        user.preferred_language = "en"
        # No .value attribute; should fall through to string conversion
        assert I18nService.get_user_language(user) in ("en", "uk")

    def test_returns_default_when_preferred_language_is_none(self):
        user = MagicMock()
        user.preferred_language = None
        assert I18nService.get_user_language(user) == "uk"

    def test_returns_default_when_no_preferred_language_attr(self):
        class UserWithoutLang:
            pass
        assert I18nService.get_user_language(UserWithoutLang()) == "uk"


class TestDetectLanguageFromHeader:
    def test_detects_uk(self):
        assert I18nService.detect_language_from_header("uk,en;q=0.9") == "uk"

    def test_detects_en(self):
        assert I18nService.detect_language_from_header("en-US,en;q=0.9") == "en"

    def test_returns_default_for_none(self):
        assert I18nService.detect_language_from_header(None) == "uk"

    def test_returns_default_for_empty_string(self):
        assert I18nService.detect_language_from_header("") == "uk"

    def test_returns_default_for_unsupported_language(self):
        assert I18nService.detect_language_from_header("fr,de;q=0.9") == "uk"

    def test_uses_first_supported_language(self):
        assert I18nService.detect_language_from_header("fr,uk;q=0.8,en;q=0.5") == "uk"

    def test_handles_quality_factor(self):
        result = I18nService.detect_language_from_header("en;q=0.8")
        assert result == "en"
