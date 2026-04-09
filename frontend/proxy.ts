import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Languages that map to Ukrainian interface
const UKRAINIAN_LANGS = new Set(["uk", "ru"]);

function detectLocale(acceptLanguage: string | null): "uk" | "en" {
  if (!acceptLanguage) return "en";
  const langs = acceptLanguage
    .split(",")
    .map((s) => s.split(";")[0].trim().slice(0, 2).toLowerCase());
  for (const lang of langs) {
    if (UKRAINIAN_LANGS.has(lang)) return "uk";
  }
  return "en";
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // If user already has an explicit locale in the URL or a remembered cookie → skip detection
  const hasLocaleInPath = /^\/(uk|en)(\/|$)/.test(pathname);
  const rememberedLocale = request.cookies.get("NEXT_LOCALE")?.value;

  if (!hasLocaleInPath && !rememberedLocale) {
    const locale = detectLocale(request.headers.get("Accept-Language"));
    if (locale === "en") {
      const url = request.nextUrl.clone();
      url.pathname = `/en${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
    // locale === "uk": default, no redirect needed — intlMiddleware handles it
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(uk|en)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
