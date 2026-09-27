import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 60000,
});

const TOKEN_KEY = "ff_access_token";

// Web fallback (expo-secure-store has limited web support)
async function storeGet(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }
  return (await SecureStore.getItemAsync(key)) ?? null;
}

async function storeSet(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value);
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function storeDelete(key: string): Promise<void> {
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } catch {}
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getToken(): Promise<string | null> {
  return storeGet(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  await storeSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storeDelete(TOKEN_KEY);
}

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global 401 handler: silently clear the token so RootGate will route the user
// back to /(auth)/login on the next render pass. This prevents Expo's LogBox
// from surfacing "Uncaught Error: Request failed with status code 401" whenever
// the token is missing / expired / revoked (e.g. right after logout, on cold
// start before hydration finishes, or when a JWT ages out).
let _onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  _onUnauthorized = fn;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error?.response?.status === 401) {
      try {
        await clearToken();
      } catch {}
      if (_onUnauthorized) {
        try {
          _onUnauthorized();
        } catch {}
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiErrorDetail(detail: any): string {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
