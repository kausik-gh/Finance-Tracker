import { clearLocalData, getMeta, setMeta } from "./db";
import { API_BASE, api } from "./api";
import { User } from "./types";

export async function checkSession(): Promise<User | null> {
  const cached = await getMeta<User | null>("user");
  if (!navigator.onLine) return cached ?? null;
  try {
    const response = await api.get("/api/me");
    const user = response.ok ? ((await response.json()) as User) : null;
    await setMeta("user", user);
    return user;
  } catch {
    return cached ?? null;
  }
}

export const googleSignInUrl = `${API_BASE}/auth/google`;

export async function signOut(clearLocalCache = true) {
  if (clearLocalCache) await clearLocalData();
}
