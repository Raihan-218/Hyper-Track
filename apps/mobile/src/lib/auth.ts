import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "hyper_track_access_token";
const REFRESH_TOKEN_KEY = "hyper_track_refresh_token";
let webToken: string | null = null;
let webRefreshToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") return webToken;
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === "web") { webToken = token; return; }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") return webRefreshToken;
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (Platform.OS === "web") { webRefreshToken = token; return; }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") { webToken = null; webRefreshToken = null; return; }
  await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)]);
}
