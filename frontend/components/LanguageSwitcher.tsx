"use client";

import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localeFlags, routing } from "@/i18n/routing";

export default function LanguageSwitcherButtons() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { user, setLanguage } = useAuth();

  const switchLocale = async (newLocale: Locale) => {
    if (user) {
      setLanguage(newLocale).catch(console.error);
    }

    const qs = searchParams.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { locale: newLocale });
  };

  return (
    <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 w-fit">
      {routing.locales.map((loc) => (
        <button
          type="button"
          key={loc}
          onClick={() => switchLocale(loc as Locale)}
          title={loc.toUpperCase()}
          className={`
            flex items-center justify-center w-8 h-7 rounded-md text-base transition-all duration-200
            ${
              locale === loc
                ? "bg-white shadow-sm"
                : "opacity-50 hover:opacity-80 hover:bg-gray-50"
            }
          `}
        >
          {localeFlags[loc]}
        </button>
      ))}
    </div>
  );
}
