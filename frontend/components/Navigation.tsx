"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import LanguageSwitcher from "./LanguageSwitcher";
import { Link } from "@/i18n/navigation";

export default function Navigation() {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const { user, logout } = useAuth();

  return (
    <nav className="bg-white shadow sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link
              href="/"
              className="text-2xl font-extrabold text-blue-600 tracking-tight"
            >
              CoQuest
            </Link>

            {user && (
              <div className="ml-10 flex items-center space-x-6">
                <Link
                  href="/dashboard"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                >
                  {t("dashboard")}
                </Link>
                <Link
                  href="/explore"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                >
                  {t("explore")}
                </Link>
                {user.role === "teacher" && (
                  <Link
                    href="/create"
                    className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                  >
                    {t("create")}
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-6">
            <LanguageSwitcher />

            {user ? (
              <div className="flex items-center space-x-4 border-l pl-6 border-gray-200">
                <Link
                  href="/profile"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                >
                  {t("profile")}
                </Link>
                <button
                  onClick={logout}
                  className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  {t("logout")}
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-4 border-l pl-6 border-gray-200">
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                >
                  {tAuth("login.submit")}
                </Link>
                <Link
                  href="/register"
                  className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700 shadow-sm transition-all"
                >
                  {tAuth("register.submit")}{" "}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
