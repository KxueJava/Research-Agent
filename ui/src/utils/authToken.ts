const ACCESS_TOKEN_KEY = "research.admin.access-token";
const REFRESH_TOKEN_KEY = "research.admin.refresh-token";

function storage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function getAccessToken(): string | null {
  return storage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function getAuthorizationHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function storeAccessToken(token: string): void {
  storage()?.setItem(ACCESS_TOKEN_KEY, token);
}

export function storeRefreshToken(token: string): void {
  storage()?.setItem(REFRESH_TOKEN_KEY, token);
}

export function clearAuthTokens(): void {
  storage()?.removeItem(ACCESS_TOKEN_KEY);
  storage()?.removeItem(REFRESH_TOKEN_KEY);
}
