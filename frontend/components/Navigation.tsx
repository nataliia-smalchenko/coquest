"use client";

import { Activity, BookOpen, Menu, Sword, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, usePathname } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Navigation() {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const { user, isLoading, fetchUser, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Close menu on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname triggers the effect; setMenuOpen is a stable setter
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Hide navigation during active gameplay
  const isGamePage =
    pathname.includes("/run/") &&
    (pathname.endsWith("/game") ||
      pathname.endsWith("/lobby") ||
      pathname.endsWith("/results"));
  if (isGamePage) return null;

  const isActive = (href: string) => pathname.startsWith(href);

  const teacherLinks = [
    // {
    //   href: "/teacher/dashboard",
    //   label: t("dashboard"),
    //   icon: <LayoutDashboard size={16} />,
    // },
    {
      href: "/teacher/resources",
      label: t("resources"),
      icon: <BookOpen size={16} />,
    },
    {
      href: "/teacher/resource-sets",
      label: t("resourceSets"),
      icon: <Sword size={16} />,
    },
    {
      href: "/teacher/runs",
      label: t("runs"),
      icon: <Activity size={16} />,
    },
  ];

  const linkStyle = (active: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "14px",
    fontWeight: active ? 600 : 500,
    color: active ? "#2563eb" : "#374151",
    textDecoration: "none",
    padding: "4px 0",
    borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
    transition: "color 0.15s, border-color 0.15s",
  });

  const mobileLinkStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    fontSize: "15px",
    fontWeight: active ? 600 : 500,
    color: active ? "#2563eb" : "#111827",
    backgroundColor: active ? "#eff6ff" : "transparent",
    borderRadius: "10px",
    textDecoration: "none",
    transition: "background-color 0.15s, color 0.15s",
  });

  return (
    <nav
      style={{
        background: "white",
        borderBottom: "1px solid #e5e7eb",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      {/* Main bar */}
      <div
        style={{
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "0 16px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        {/* Left: logo + desktop nav */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <Link
            href="/"
            style={{
              fontSize: "22px",
              fontWeight: 800,
              color: "#2563eb",
              letterSpacing: "-0.02em",
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            CoQuest
          </Link>

          {/* Desktop nav links — hidden on mobile */}
          {user && user.role === "teacher" && (
            <div
              className="desktop-nav"
              style={{ display: "flex", alignItems: "center", gap: "24px" }}
            >
              {teacherLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={linkStyle(isActive(link.href))}
                >
                  {link.icon}
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right: language + profile/auth + burger */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Language switcher — hidden on mobile */}
          <div className="desktop-nav">
            <LanguageSwitcher />
          </div>

          {isLoading ? (
            <div
              style={{
                width: "72px",
                height: "32px",
                backgroundColor: "#f3f4f6",
                borderRadius: "8px",
                animation: "pulse 1.5s infinite",
              }}
            />
          ) : user ? (
            <>
              {/* Desktop: profile + logout */}
              <div
                className="desktop-nav"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  borderLeft: "1px solid #e5e7eb",
                  paddingLeft: "16px",
                }}
              >
                <Link
                  href="/profile"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#374151",
                    textDecoration: "none",
                  }}
                >
                  {user.full_name ?? t("profile")}
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#ef4444",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  {t("logout")}
                </button>
              </div>

              {/* Mobile burger */}
              <button
                type="button"
                className="mobile-nav"
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  display: "none",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  border: "1.5px solid #e5e7eb",
                  background: "white",
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          ) : (
            <>
              {/* Desktop: login + register */}
              <div
                className="desktop-nav"
                style={{ display: "flex", alignItems: "center", gap: "10px" }}
              >
                <Link
                  href="/login"
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    color: "#374151",
                    textDecoration: "none",
                  }}
                >
                  {tAuth("login.submit")}
                </Link>
                <Link
                  href="/register"
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "white",
                    backgroundColor: "#2563eb",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    textDecoration: "none",
                  }}
                >
                  {tAuth("register.submit")}
                </Link>
              </div>

              {/* Mobile burger for unauthenticated */}
              <button
                type="button"
                className="mobile-nav"
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  display: "none",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "40px",
                  height: "40px",
                  borderRadius: "10px",
                  border: "1.5px solid #e5e7eb",
                  background: "white",
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                {menuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile overlay + drawer */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses menu on click */}
          <div
            role="presentation"
            onClick={() => setMenuOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.35)",
              zIndex: 99,
              animation: "fadeIn 0.2s ease",
            }}
          />

          {/* Drawer */}
          <div
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: "280px",
              backgroundColor: "white",
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
              animation: "slideIn 0.25s ease",
            }}
          >
            {/* Drawer header */}
            <div
              style={{
                height: "56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 16px",
                borderBottom: "1px solid #f3f4f6",
                flexShrink: 0,
              }}
            >
              <span
                style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}
              >
                {user ? user.full_name : "CoQuest"}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  border: "1.5px solid #e5e7eb",
                  background: "white",
                  cursor: "pointer",
                  color: "#374151",
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Nav links */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
              {user &&
                user.role === "teacher" &&
                teacherLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    style={mobileLinkStyle(isActive(link.href))}
                  >
                    {link.icon}
                    {link.label}
                  </Link>
                ))}

              {user && (
                <>
                  <div
                    style={{
                      height: "1px",
                      background: "#f3f4f6",
                      margin: "8px 0",
                    }}
                  />
                  <Link
                    href="/profile"
                    style={mobileLinkStyle(isActive("/profile"))}
                  >
                    {t("profile")}
                  </Link>
                </>
              )}

              {!user && (
                <>
                  <Link
                    href="/login"
                    style={mobileLinkStyle(isActive("/login"))}
                  >
                    {tAuth("login.submit")}
                  </Link>
                  <Link
                    href="/register"
                    style={mobileLinkStyle(isActive("/register"))}
                  >
                    {tAuth("register.submit")}
                  </Link>
                </>
              )}
            </div>

            {/* Footer: language + logout (authenticated) / language only (guest) */}
            <div
              style={{
                borderTop: "1px solid #f3f4f6",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                flexShrink: 0,
              }}
            >
              <div style={{ padding: "4px 4px 8px" }}>
                <LanguageSwitcher />
              </div>
              {user && (
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "12px 16px",
                    fontSize: "15px",
                    fontWeight: 500,
                    color: "#ef4444",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: "10px",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  {t("logout")}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
