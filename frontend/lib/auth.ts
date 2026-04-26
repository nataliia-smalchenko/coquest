import Cookies from "js-cookie";
import type {
  AuthResponse,
  LoginCredentials,
  RegisterData,
  User,
} from "@/types";
import api from "./api";

export const authService = {
  async register(data: RegisterData): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>("/api/auth/register", data);
    this.saveTokens(response.data);
    return response.data;
  },

  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>(
      "/api/auth/login",
      credentials,
    );
    this.saveTokens(response.data);
    return response.data;
  },

  async getMe(): Promise<User> {
    const response = await api.get<User>("/api/auth/me");
    return response.data;
  },

  logout() {
    Cookies.remove("access_token");
    Cookies.remove("refresh_token");
    // Preserve locale prefix so i18n middleware doesn't redirect again
    const pathLocale =
      typeof window !== "undefined"
        ? window.location.pathname.split("/")[1]
        : "";
    const validLocales = ["uk", "en"];
    const prefix = validLocales.includes(pathLocale) ? `/${pathLocale}` : "";
    window.location.href = `${prefix}/login`;
  },

  saveTokens(authResponse: AuthResponse) {
    const cookieOpts = {
      sameSite: "strict" as const,
      secure: process.env.NODE_ENV === "production",
    };
    Cookies.set("access_token", authResponse.access_token, {
      expires: 1 / 96,
      ...cookieOpts,
    }); // 15 min
    Cookies.set("refresh_token", authResponse.refresh_token, {
      expires: 7,
      ...cookieOpts,
    }); // 7 days
  },

  isAuthenticated(): boolean {
    return !!Cookies.get("access_token");
  },
};
