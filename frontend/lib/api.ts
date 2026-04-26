import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import Cookies from "js-cookie";
import type { RefreshResponse } from "@/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Interface for requests waiting for a new token
interface FailedRequest {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

/** Redirect to /login while preserving the current i18n locale prefix. */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const segments = window.location.pathname.split("/");
  const LOCALES = ["uk", "en"];
  const localePrefix = LOCALES.includes(segments[1]) ? `/${segments[1]}` : "";
  window.location.href = `${localePrefix}/login`;
}

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Variables to handle multiple failing requests
let isRefreshing = false;
let failedQueue: FailedRequest[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token ?? "");
  });
  failedQueue = [];
};

// Add token to requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get("access_token");
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError): Promise<AxiosError> => {
    return Promise.reject(error);
  },
);

// Handle token refresh
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Check if error is 401 and it's not a retry already
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // If refresh is already in progress, add this request to queue
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = Cookies.get("refresh_token");

      if (!refreshToken) {
        isRefreshing = false;
        processQueue(error, null);
        Cookies.remove("access_token");
        redirectToLogin();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post<RefreshResponse>(
          `${API_URL}/api/auth/refresh`,
          { refresh_token: refreshToken },
        );

        const newAccessToken = data.access_token;

        Cookies.set("access_token", newAccessToken, {
          expires: 1 / 96, // 15 min
          sameSite: "strict",
          secure: process.env.NODE_ENV === "production",
        });

        processQueue(null, newAccessToken);
        isRefreshing = false;

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;

        Cookies.remove("access_token");
        Cookies.remove("refresh_token");
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
