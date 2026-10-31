import { Platform } from "react-native";
import { getToken } from "./auth";

const rawUrl = process.env.EXPO_PUBLIC_API_URL;
const API_URL =
  Platform.OS === "web" && rawUrl?.includes("10.0.2.2")
    ? rawUrl.replace("10.0.2.2", "localhost")
    : rawUrl ?? "http://localhost:4000/api";

if (!rawUrl) console.warn("EXPO_PUBLIC_API_URL is not configured; defaulting to " + API_URL);

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new Error("API URL is missing. Set EXPO_PUBLIC_API_URL in apps/mobile/.env.");
  const token = await getToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
  return payload as T;
}
