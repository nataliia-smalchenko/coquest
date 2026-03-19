"use client";

import { create } from "zustand";
import { User } from "@/types";
import { authService } from "@/lib/auth";
import api from "@/lib/api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  language: string;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  setLanguage: (lang: string) => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
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
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || "Login failed",
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
    } catch (error: any) {
      set({
        error: error.response?.data?.detail || "Registration failed",
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
    if (!authService.isAuthenticated()) return;

    set({ isLoading: true });
    try {
      const user = await authService.getMe();
      set({
        user,
        language: user.preferred_language || "uk",
        isLoading: false,
      });
    } catch (error) {
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
