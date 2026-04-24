import json
from pathlib import Path
from typing import Dict, Any

import structlog

log = structlog.get_logger(__name__)


class I18nService:
    """Backend internationalization service"""

    SUPPORTED_LANGUAGES = ["uk", "en"]
    DEFAULT_LANGUAGE = "uk"

    _translations_cache: Dict[str, Dict[str, Any]] = {}

    @classmethod
    def _load_translations(cls, language: str, domain: str) -> Dict[str, Any]:
        """Load translations from JSON file with caching and safe fallback"""
        cache_key = f"{language}:{domain}"

        if cache_key in cls._translations_cache:
            return cls._translations_cache[cache_key]

        translations_dir = Path(__file__).parent.parent.parent / "translations"
        file_path = translations_dir / language / f"{domain}.json"

        # Fallback to default language if file doesn't exist
        if not file_path.exists():
            file_path = translations_dir / cls.DEFAULT_LANGUAGE / f"{domain}.json"

        # Safe file reading
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                translations = json.load(f)
        except FileNotFoundError:
            log.warning("translation_file_missing", path=str(file_path))
            translations = {}
        except json.JSONDecodeError:
            log.error("translation_file_invalid_json", path=str(file_path))
            translations = {}

        cls._translations_cache[cache_key] = translations
        return translations

    @classmethod
    def get_translation(cls, language: str, domain: str, key: str, **kwargs) -> str:
        """Get translated string with variable substitution"""
        if language not in cls.SUPPORTED_LANGUAGES:
            language = cls.DEFAULT_LANGUAGE

        translations = cls._load_translations(language, domain)

        # Navigate nested keys
        keys = key.split(".")
        value = translations

        for k in keys:
            if isinstance(value, dict):
                value = value.get(k, key)
            else:
                # If we hit a non-dict before the key ends, return the original key
                value = key
                break

        # Format with variables safely
        if isinstance(value, str) and kwargs:
            try:
                value = value.format(**kwargs)
            except (KeyError, ValueError, IndexError) as e:
                log.warning("translation_format_error", key=key, error=str(e))
                pass

        # Ensure we always return a string (in case the final key points to a dict/list)
        return str(value) if not isinstance(value, dict) else key

    @classmethod
    def get_user_language(cls, user) -> str:
        """Get user's preferred language"""
        if user and hasattr(user, "preferred_language") and user.preferred_language:
            # Assumes user.preferred_language might be an Enum, so convert to string
            lang_str = str(
                user.preferred_language.value
                if hasattr(user.preferred_language, "value")
                else user.preferred_language
            )
            if lang_str in cls.SUPPORTED_LANGUAGES:
                return lang_str

        return cls.DEFAULT_LANGUAGE

    @classmethod
    def detect_language_from_header(cls, accept_language: str = None) -> str:
        """Detect language from Accept-Language header"""
        if not accept_language:
            return cls.DEFAULT_LANGUAGE

        for lang in accept_language.split(","):
            if ";" in lang:
                lang, _ = lang.split(";")
            lang = lang.strip().lower()[:2]
            if lang in cls.SUPPORTED_LANGUAGES:
                return lang

        return cls.DEFAULT_LANGUAGE
