"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGoogleLogin } from "@react-oauth/google";
import api from "@/lib/api";
import { Eye, EyeOff, Loader2, MailCheck, CheckCircle2 } from "lucide-react";

const loginSchema = z.object({
  email: z.email({ message: "Invalid email format" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" }),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, error: authError } = useAuth();
  // Local UI states
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState("");

  // Verification states
  const [needsVerification, setNeedsVerification] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      router.push("/dashboard");
    } catch (err) {
      console.error("Login attempt failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      setCustomError("");
      setSuccessMessage("");
      try {
        const { data } = await api.post("/api/auth/google", {
          token: tokenResponse.access_token,
        });

        document.cookie = `access_token=${data.access_token}; path=/`;
        document.cookie = `refresh_token=${data.refresh_token}; path=/`;

        router.push("/dashboard");
      } catch (err: any) {
        console.error("Google Auth failed:", err);
        setCustomError(err.response?.data?.detail || "Google login failed");
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => setCustomError("Google login failed. Please try again."),
  });

  const handleResendVerification = async () => {
    try {
      setSuccessMessage("");
      setCustomError("");

      await api.post("/api/auth/resend-verification", { email: userEmail });

      setSuccessMessage(
        "Verification email successfully sent! Please check your inbox.",
      );
    } catch (err) {
      setCustomError(
        "Failed to resend verification email. Please try again later.",
      );
    }
  };

  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center space-y-6">
          <div className="flex justify-center">
            <MailCheck className="h-20 w-20 text-blue-500" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Verify your email
          </h2>
          <p className="text-gray-600">
            Please click the link in the email we sent to{" "}
            <strong>{userEmail}</strong> to activate your account before signing
            in.
          </p>

          {successMessage && (
            <div className="bg-green-50 border-l-4 border-green-500 text-green-700 p-3 rounded shadow-sm text-sm text-left flex items-start">
              <CheckCircle2 className="h-5 w-5 mr-2 flex-shrink-0" />
              <p>{successMessage}</p>
            </div>
          )}

          {customError && (
            <div className="text-sm text-red-600 font-medium">
              {customError}
            </div>
          )}

          <div className="flex flex-col space-y-3">
            <button
              onClick={handleResendVerification}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all"
            >
              Resend verification email
            </button>
            <button
              onClick={() => {
                setNeedsVerification(false);
                setCustomError("");
                setSuccessMessage("");
              }}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Sign in to CoQuest
          </h2>
          <p className="mt-2 text-sm text-gray-600">Welcome back!</p>
        </div>

        {/* Google Auth button */}
        <button
          type="button"
          onClick={() => googleLogin()}
          disabled={isLoading}
          className="w-full flex justify-center items-center gap-3 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">
              Or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Відображення помилок з useAuth або локальних */}
          {(authError || customError) && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded shadow-sm text-sm">
              {customError || authError}
            </div>
          )}

          {/* Email field */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              {...register("email")}
              type="email"
              autoComplete="email"
              className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                errors.email ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password field with Show/Hide */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative mt-1">
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                  errors.password ? "border-red-500" : "border-gray-300"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <div className="text-center mt-4 text-sm text-gray-600">
            Don't have an account?{" "}
            <a
              href="/register"
              className="font-medium text-blue-600 hover:text-blue-500 underline-offset-4 hover:underline"
            >
              Register now
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
