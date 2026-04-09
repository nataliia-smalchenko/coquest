"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, localeFlags } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";
import { useAuth } from "@/hooks/useAuth";

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
