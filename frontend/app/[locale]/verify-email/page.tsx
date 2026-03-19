"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");
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
        setTimeout(() => router.push("/login"), 3000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.response?.data?.detail || "Verification failed.");
      }
    };
    verify();
  }, [searchParams, router]);

  return (
    <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center space-y-6">
      {status === "loading" && (
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-16 w-16 text-blue-600 animate-spin" />
          <h2 className="text-2xl font-extrabold text-gray-900">
            Verifying...
          </h2>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center space-y-4 animate-in fade-in zoom-in">
          <CheckCircle2 className="h-20 w-20 text-green-500" />
          <h2 className="text-3xl font-extrabold text-gray-900">Success!</h2>
          <p>{message}</p>
        </div>
      )}

      {status === "error" && (
        <div className="flex flex-col items-center space-y-4 animate-in fade-in">
          <XCircle className="h-20 w-20 text-red-500" />
          <h2 className="text-3xl font-extrabold text-gray-900">Failed</h2>
          <p>{message}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full bg-blue-600 text-white py-2 rounded-md"
          >
            Return to Sign in
          </button>
        </div>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Suspense
        fallback={
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
            <p className="mt-4 text-gray-500">Loading verification page...</p>
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
