import api from "./api";
import Cookies from "js-cookie";
import { AuthResponse, LoginCredentials, RegisterData, User } from "@/types";

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
    window.location.href = "/login";
  },

  saveTokens(authResponse: AuthResponse) {
    Cookies.set("access_token", authResponse.access_token, { expires: 1 / 96 }); // 15 min
    Cookies.set("refresh_token", authResponse.refresh_token, { expires: 7 }); // 7 days
  },

  isAuthenticated(): boolean {
    return !!Cookies.get("access_token");
  },
};
