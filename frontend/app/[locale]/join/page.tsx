"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { joinRun, rejoinRun } from "@/lib/api/runs";
import {
  clearRunStorage,
  getRunStorageByCode,
  setRunStorage,
} from "@/hooks/useGameRun";
import { useAuth } from "@/hooks/useAuth";

export default function JoinPage() {
  const t = useTranslations("game.join");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stored run data for this code (if player previously joined)
  const [storedRun, setStoredRun] = useState<{
    run_id: string;
    guest_token: string;
    player_id: string;
    display_name?: string;
  } | null>(null);

  // Initialise code from URL param and check localStorage
  useEffect(() => {
    const c = searchParams.get("code");
    if (c) {
      const upper = c.toUpperCase();
      setCode(upper);
      const stored = getRunStorageByCode(upper);
      if (stored) {
        setStoredRun(stored);
        if (stored.display_name) setName(stored.display_name);
      }
    }
  }, [searchParams]);

  // When code reaches 6 chars, check localStorage
  useEffect(() => {
    if (code.length === 6) {
      const stored = getRunStorageByCode(code);
      setStoredRun(stored);
      if (stored?.display_name && !name) setName(stored.display_name);
    } else {
      setStoredRun(null);
    }
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSwitchPlayer = () => {
    if (storedRun) {
      clearRunStorage(storedRun.run_id);
    }
    setStoredRun(null);
    setName("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      // Try rejoin first if we have a stored token for this code
      if (storedRun && !user) {
        try {
          const player = await rejoinRun(
            code.toUpperCase(),
            storedRun.guest_token,
          );
          setRunStorage(player.run_id, {
            guest_token: storedRun.guest_token,
            player_id: player.id,
            join_code: code.toUpperCase(),
            display_name: player.display_name,
          });
          if (player.status === "playing") {
            router.push(`/run/${player.run_id}/game`);
          } else if (player.status === "finished") {
            router.push(`/run/${player.run_id}/results`);
          } else {
            router.push(`/run/${player.run_id}/lobby`);
          }
          return;
        } catch {
          // Rejoin failed (token expired / run deleted) — fall through to fresh join
          clearRunStorage(storedRun.run_id);
          setStoredRun(null);
        }
      }

      const player = await joinRun({
        join_code: code.toUpperCase(),
        guest_name: user ? undefined : name.trim() || undefined,
      });
      if (player.guest_token) {
        setRunStorage(player.run_id, {
          guest_token: player.guest_token,
          player_id: player.id,
          join_code: code.toUpperCase(),
          display_name: player.display_name,
        });
      }
      router.push(`/run/${player.run_id}/lobby`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail;
      if (msg?.toLowerCase().includes("full")) {
        setError(t("runFull"));
      } else if (
        msg?.toLowerCase().includes("closed") ||
        msg?.toLowerCase().includes("not found")
      ) {
        setError(t("runClosed"));
      } else {
        setError(t("invalidCode"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl mx-auto mb-4 flex items-center justify-center">
            <span className="text-white text-2xl font-bold">C</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Run code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t("code")}
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().slice(0, 6))
              }
              placeholder={t("codePlaceholder")}
              maxLength={6}
              required
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-lg font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
            />
          </div>

          {/* Guest name (only if not logged in) */}
          {!user && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {t("name")}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("namePlaceholder")}
                maxLength={50}
                required
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {storedRun && (
                <button
                  type="button"
                  onClick={handleSwitchPlayer}
                  className="mt-1.5 text-xs text-blue-500 hover:text-blue-700 underline"
                >
                  {t("switchPlayer")}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6 || (!user && !name.trim())}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors text-base"
          >
            {loading ? "..." : t("submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
