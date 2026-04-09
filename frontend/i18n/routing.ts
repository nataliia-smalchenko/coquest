import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["uk", "en"],
  defaultLocale: "uk",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];

export const localeNames: Record<Locale, string> = {
  en: "English",
  uk: "Українська",
};

export const localeFlags: Record<Locale, string> = {
  en: "🇬🇧",
  uk: "🇺🇦",
};
