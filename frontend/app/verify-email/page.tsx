"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  // Double API Call Protection in React Strict Mode
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (hasAttempted.current) return;

    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Invalid or missing verification link.");
      return;
    }

    hasAttempted.current = true;

    const verify = async () => {
      try {
        await api.post("/api/auth/verify-email", { token });
        setStatus("success");
        setMessage("Your email has been successfully verified!");

        setTimeout(() => {
          router.push("/login");
        }, 3000);
      } catch (err: any) {
        setStatus("error");
        setMessage(
          err.response?.data?.detail ||
            "Verification failed. The link might be expired.",
        );
      }
    };

    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center space-y-6 transition-all duration-300">
        {/* Status: Loading */}
        {status === "loading" && (
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
            <h2 className="text-2xl font-extrabold text-gray-900">
              Verifying your email...
            </h2>
            <p className="text-sm text-gray-500">Please wait a moment.</p>
          </div>
        )}

        {/* Status: Success */}
        {status === "success" && (
          <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-500">
            <CheckCircle2 className="h-20 w-20 text-green-500" />
            <h2 className="text-3xl font-extrabold text-gray-900">Success!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm font-medium text-blue-600 animate-pulse">
              Redirecting to sign in...
            </p>
          </div>
        )}

        {/* Status: Error */}
        {status === "error" && (
          <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in duration-300">
            <XCircle className="h-20 w-20 text-red-500" />
            <h2 className="text-3xl font-extrabold text-gray-900">
              Verification Failed
            </h2>
            <p className="text-gray-600">{message}</p>
            <button
              onClick={() => router.push("/login")}
              className="w-full mt-4 flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all"
            >
              Return to Sign in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
