import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Languages that map to Ukrainian interface
const UKRAINIAN_LANGS = new Set(["uk", "ru"]);

// Routes that require an authenticated user (checked against locale-stripped path)
const PROTECTED_PREFIXES = ["/teacher", "/student", "/profile", "/run"];

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

/** Strip the locale segment (/uk or /en) to get the canonical path. */
function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(uk|en)(?=\/|$)/, "") || "/";
}

/** Build a login redirect that preserves the current locale prefix. */
function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const hasLocale = /^\/(uk|en)(\/|$)/.test(request.nextUrl.pathname);
  const localeSegment = hasLocale
    ? `/${request.nextUrl.pathname.split("/")[1]}`
    : "";
  url.pathname = `${localeSegment}/login`;
  url.search = "";
  return NextResponse.redirect(url);
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const canonical = stripLocale(pathname);

  // Guard protected routes: require at least one auth cookie to exist.
  // The API enforces real token validity; this only prevents obvious unauthenticated access.
  if (PROTECTED_PREFIXES.some((prefix) => canonical.startsWith(prefix))) {
    const hasToken =
      request.cookies.has("access_token") ||
      request.cookies.has("refresh_token");
    if (!hasToken) return loginRedirect(request);
  }

  // If user already has an explicit locale in the URL or a remembered cookie → skip detection
  const hasLocaleInPath = /^\/(uk|en)(\/|$)/.test(pathname);
  const rememberedLocale = request.cookies.get("NEXT_LOCALE")?.value;

  if (!hasLocaleInPath && !rememberedLocale) {
    const locale = detectLocale(request.headers.get("Accept-Language"));
    // For the default locale with localePrefix: "as-needed", the canonical URL
    // has NO prefix (e.g. "/teacher/resources", not "/uk/teacher/resources").
    // Redirecting to "/uk/..." would cause intlMiddleware to redirect back to "/...",
    // creating an infinite loop. Only redirect for non-default locales.
    if (locale !== routing.defaultLocale) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
      return NextResponse.redirect(url);
    }
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(uk|en)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
