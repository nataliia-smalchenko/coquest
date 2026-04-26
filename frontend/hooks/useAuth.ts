"use client";

import Cookies from "js-cookie";
import { create } from "zustand";
import api from "@/lib/api";
import { authService } from "@/lib/auth";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  language: string;
  login: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, unknown>) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  setLanguage: (lang: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  error: null,
  language: "uk",

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login({ email, password });
      set({
        user: response.user,
        language: response.user.preferred_language || "uk",
        isLoading: false,
      });
      return response.user;
    } catch (error: unknown) {
      set({
        error:
          (error as { response?: { data?: { detail?: string } } }).response
            ?.data?.detail || "Login failed",
        isLoading: false,
      });
      throw error;
    }
  },

  register: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await authService.register(data);
      set({ isLoading: false });
    } catch (error: unknown) {
      set({
        error:
          (error as { response?: { data?: { detail?: string } } }).response
            ?.data?.detail || "Registration failed",
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    authService.logout();
    set({ user: null, language: "uk" });
  },

  fetchUser: async () => {
    if (!Cookies.get("access_token") && !Cookies.get("refresh_token")) {
      set({ isLoading: false });
      return;
    }

    if (!get().user) {
      set({ isLoading: true });
    }
    try {
      const user = await authService.getMe();
      set({
        user,
        language: user.preferred_language || "uk",
        isLoading: false,
      });
    } catch (_error) {
      set({ user: null, isLoading: false });
    }
  },

  setLanguage: async (lang: string) => {
    try {
      if (authService.isAuthenticated()) {
        await api.patch("/api/user/language", { language: lang });
      }
      set({ language: lang });
    } catch (error) {
      console.error("Failed to update language on backend", error);
    }
  },
}));
