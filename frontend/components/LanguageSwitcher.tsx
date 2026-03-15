"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, localeFlags } from "@/i18n/routing";
import type { Locale } from "@/i18n/routing";

export default function LanguageSwitcherButtons() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLocale = (newLocale: Locale) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
      {routing.locales.map((loc) => (
        <button
          key={loc}
          onClick={() => switchLocale(loc)}
          className={`
            flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200
            ${
              locale === loc
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
            }
          `}
        >
          <span className="mr-2 text-base">{localeFlags[loc]}</span>
          {loc.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
