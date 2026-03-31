"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGoogleLogin } from "@react-oauth/google";
import api from "@/lib/api";
import {
  Eye,
  EyeOff,
  Loader2,
  User,
  Mail,
  Lock,
  CheckCircle2,
} from "lucide-react";

const registerSchema = z
  .object({
    email: z.string().email({ message: "invalidEmail" }),
    password: z
      .string()
      .min(8, "passwordMin")
      .regex(/[A-Z]/, "passwordUppercase")
      .regex(/[0-9]/, "passwordNumber"),
    confirmPassword: z.string(),
    full_name: z.string().min(2, { message: "nameShort" }),
    role: z.enum(["student", "teacher"] as const, {
      message: "registerFailed",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const locale = useLocale();
  const { register: authRegister, error: authError } = useAuth();

  const t = useTranslations("auth.register");
  const tErrors = useTranslations("auth.errors");
  const tCommon = useTranslations("common");

  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [customError, setCustomError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "student",
    },
  });

  const selectedRole = watch("role");

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setIsLoading(true);
      setCustomError("");
      try {
        const { data } = await api.post("/api/auth/google", {
          token: tokenResponse.access_token,
        });
        document.cookie = `access_token=${data.access_token}; path=/`;
        document.cookie = `refresh_token=${data.refresh_token}; path=/`;
        router.push(data.user.role === "teacher" ? "/teacher/resources" : "/student");
      } catch {
        setCustomError(tErrors("googleLoginFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => setCustomError(tErrors("googleLoginFailed")),
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setCustomError("");
    try {
      const { confirmPassword, ...registerData } = data;
      await authRegister({
        ...registerData,
        language: locale,
      });

      setIsSuccess(true);
    } catch (err: any) {
      console.error("Registration failed:", err);
      if (err.response?.status === 409) {
        setCustomError(tErrors("emailExists"));
      } else {
        setCustomError(tErrors("registerFailed"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle2 className="h-20 w-20 text-green-500" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            {t("success.title")}
          </h2>
          <p className="text-gray-600">{t("success.message")}</p>
          <button
            onClick={() => router.push("/login")}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-all"
          >
            {t("success.backToLogin")}
          </button>
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
          {t("google")}
        </button>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">{t("or")}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Відображення помилок з useAuth або локальних */}
          {(authError || customError) && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded text-sm">
              {customError || authError}
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("fullName")}
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-4 w-4 text-gray-400" />
              </div>
              <input
                {...register("full_name")}
                type="text"
                className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.full_name ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="John Doe"
              />
            </div>
            {errors.full_name && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {tErrors(errors.full_name.message as any)}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("email")}
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-4 w-4 text-gray-400" />
              </div>
              <input
                {...register("email")}
                type="email"
                className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.email ? "border-red-500" : "border-gray-300"
                }`}
                placeholder="you@example.com"
              />
            </div>
            {errors.email && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {tErrors(errors.email.message as any)}
              </p>
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("role")}
            </label>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <label
                className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-all ${
                  selectedRole === "student"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  {...register("role")}
                  type="radio"
                  value="student"
                  className="sr-only"
                />
                <span className="text-sm font-medium">{t("roleStudent")}</span>
              </label>
              <label
                className={`flex items-center justify-center p-2 border rounded-md cursor-pointer transition-all ${
                  selectedRole === "teacher"
                    ? "bg-blue-50 border-blue-500 text-blue-700"
                    : "border-gray-300 hover:bg-gray-50"
                }`}
              >
                <input
                  {...register("role")}
                  type="radio"
                  value="teacher"
                  className="sr-only"
                />
                <span className="text-sm font-medium">{t("roleTeacher")}</span>
              </label>
            </div>
            {errors.role && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {tErrors(errors.role.message as any)}
              </p>
            )}
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("password")}
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                {...register("password")}
                type={showPassword ? "text" : "password"}
                className={`block w-full pl-10 pr-10 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.password ? "border-red-500" : "border-gray-300"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {tErrors(errors.password.message as any)}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              {t("confirmPassword")}
            </label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-gray-400" />
              </div>
              <input
                {...register("confirmPassword")}
                type={showPassword ? "text" : "password"}
                className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.confirmPassword ? "border-red-500" : "border-gray-300"
                }`}
              />
            </div>
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600 font-medium">
                {tErrors(errors.confirmPassword.message as any)}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin h-5 w-5 mr-2" />
                {tCommon("loading")}
              </>
            ) : (
              t("submit")
            )}
          </button>

          <p className="text-center text-sm text-gray-600">
            {t("hasAccount")}{" "}
            <a
              href="/login"
              className="font-medium text-blue-600 hover:text-blue-500 hover:underline"
            >
              {t("login")}
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
