"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { GoogleLogin } from "@react-oauth/google";
import Cookies from "js-cookie";
import {
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  MailCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "@/i18n/navigation";
import api from "@/lib/api";
import { getApiStatus } from "@/lib/errors";

const loginSchema = z.object({
  email: z.email({ message: "invalidEmail" }),
  password: z.string().min(8, { message: "passwordMin" }),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, fetchUser, error: authError } = useAuth();

  const redirectByRole = (role: string) => {
    router.push(role === "teacher" ? "/teacher/resources" : "/student");
  };

  const t = useTranslations("auth.login");
  const tErrors = useTranslations("auth.errors");
  const tCommon = useTranslations("common");
  const tVerify = useTranslations("auth.verify");
  const tRegister = useTranslations("auth.register");
  const tGoogleRole = useTranslations("auth.googleRole");

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState("");
  const [pendingGoogleCredential, setPendingGoogleCredential] = useState<
    string | null
  >(null);
  const [selectedRole, setSelectedRole] = useState<
    "student" | "teacher" | null
  >(null);

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
    setCustomError("");
    try {
      const user = await login(data.email, data.password);
      redirectByRole(user.role);
    } catch (err: unknown) {
      if (getApiStatus(err) === 403) {
        setNeedsVerification(true);
        setUserEmail(data.email);
      } else {
        console.error("Login attempt failed:", err);
        setCustomError(tErrors("loginFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSuccess = (credential: string) => {
    setCustomError("");
    setSuccessMessage("");
    setPendingGoogleCredential(credential);
    setSelectedRole(null);
  };

  const handleGoogleWithRole = async () => {
    if (!pendingGoogleCredential || !selectedRole) return;
    setIsLoading(true);
    setCustomError("");
    try {
      const { data } = await api.post("/api/auth/google", {
        credential: pendingGoogleCredential,
        role: selectedRole,
      });
      const cookieOpts = {
        sameSite: "strict" as const,
        secure: process.env.NODE_ENV === "production",
      };
      Cookies.set("access_token", data.access_token, {
        expires: 1 / 96,
        ...cookieOpts,
      });
      Cookies.set("refresh_token", data.refresh_token, {
        expires: 7,
        ...cookieOpts,
      });

      // Backend may ignore `role` on creation — patch it explicitly if needed
      if (data.user.role !== selectedRole) {
        try {
          await api.patch("/api/user/profile", { role: selectedRole });
        } catch {
          // Existing user who can't change role — keep their current role
        }
      }

      await fetchUser();
      const finalRole = useAuth.getState().user?.role ?? data.user.role;
      redirectByRole(finalRole);
    } catch {
      setCustomError(tErrors("googleLoginFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setSuccessMessage("");
      setCustomError("");
      await api.post("/api/auth/resend-verification", { email: userEmail });
      setSuccessMessage(tVerify("successMessage"));
    } catch (_err) {
      setCustomError(tErrors("verificationFailed"));
    }
  };

  if (pendingGoogleCredential) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {tGoogleRole("title")}
            </h2>
            <p className="text-gray-500 mt-2 text-sm">
              {tGoogleRole("subtitle")}
            </p>
          </div>

          {customError && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm">
              {customError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedRole("student")}
              className={`flex flex-col items-center justify-center gap-3 p-5 border-2 rounded-xl transition-all ${
                selectedRole === "student"
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <GraduationCap size={32} />
              <span className="text-sm font-medium">
                {tRegister("roleStudent")}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole("teacher")}
              className={`flex flex-col items-center justify-center gap-3 p-5 border-2 rounded-xl transition-all ${
                selectedRole === "teacher"
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <BookOpen size={32} />
              <span className="text-sm font-medium">
                {tRegister("roleTeacher")}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogleWithRole}
            disabled={!selectedRole || isLoading}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tCommon("loading")}
              </>
            ) : (
              tGoogleRole("continue")
            )}
          </button>

          <button
            type="button"
            onClick={() => setPendingGoogleCredential(null)}
            className="w-full text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            {tGoogleRole("back")}
          </button>
        </div>
      </div>
    );
  }

  if (needsVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center space-y-6">
          <div className="flex justify-center">
            <MailCheck className="h-20 w-20 text-blue-500" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            {t("verifyEmail")}
          </h2>
          <p className="text-gray-600">
            {t("verifyEmailMessage")} <br />
            <strong>{userEmail}</strong>
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
              type="button"
              onClick={handleResendVerification}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all"
            >
              {t("resendVerification")}
            </button>
            <button
              type="button"
              onClick={() => {
                setNeedsVerification(false);
                setCustomError("");
                setSuccessMessage("");
              }}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {tVerify("backToLogin")}
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
            {t("title")}
          </h2>
        </div>

        {/* Google Auth button */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={(res) => {
              if (res.credential) handleGoogleSuccess(res.credential);
            }}
            onError={() => setCustomError(tErrors("googleLoginFailed"))}
            width={400}
            theme="outline"
            size="large"
          />
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">{t("or")}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {(authError || customError) && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded shadow-sm text-sm">
              {customError || authError}
            </div>
          )}

          {/* Email field */}
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-medium text-gray-700"
            >
              {t("email")}
            </label>
            <input
              id="login-email"
              {...register("email")}
              type="email"
              autoComplete="email"
              className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${
                errors.email ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {tErrors(errors.email.message as string)}
              </p>
            )}
          </div>

          {/* Password field */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-gray-700"
            >
              {t("password")}
            </label>
            <div className="relative mt-1">
              <input
                id="login-password"
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
                {tErrors(errors.password.message as string)}
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
                {tCommon("loading")}
              </>
            ) : (
              t("submit")
            )}
          </button>

          <div className="text-center mt-4 text-sm text-gray-600">
            {t("noAccount")}{" "}
            <a
              href="/register"
              className="font-medium text-blue-600 hover:text-blue-500 underline-offset-4 hover:underline"
            >
              {t("register")}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
