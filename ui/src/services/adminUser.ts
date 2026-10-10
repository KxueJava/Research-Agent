import api from "./index";
import {
  clearAuthTokens,
  getAccessToken as readAccessToken,
  getRefreshToken as readRefreshToken,
  storeAccessToken,
  storeRefreshToken,
} from "@/utils/authToken";

export type AdminUser = {
  id?: number;
  userId?: string;
  username: string;
  status?: number;
  createTime?: string;
  updateTime?: string;
  avatarUrl?: string;
};

export type AdminUserCredentials = {
  username: string;
  password: string;
};

export type AdminAuthResponse = {
  user: AdminUser;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
};

export type AdminProfileUpdate = {
  username?: string;
  avatarUrl?: string;
};

export type AdminPasswordChange = {
  currentPassword: string;
  newPassword: string;
};

const BASE = "/api/v1/admin/admin-user";

export const adminUserApi = {
  login: (credentials: AdminUserCredentials) =>
    api.post<AdminAuthResponse>(`${BASE}/login`, credentials) as unknown as Promise<AdminAuthResponse>,
  register: (credentials: AdminUserCredentials) =>
    api.post<boolean>(`${BASE}/create`, {
      ...credentials,
      status: 1,
    }) as unknown as Promise<boolean>,
  refresh: (refreshToken: string) =>
    api.post<AdminAuthResponse>(`${BASE}/refresh`, { refreshToken }) as unknown as Promise<AdminAuthResponse>,
  logout: () => api.post<boolean>(`${BASE}/logout`) as unknown as Promise<boolean>,
  me: () => api.get<AdminUser>(`${BASE}/me`) as unknown as Promise<AdminUser>,
  updateProfile: (payload: AdminProfileUpdate) =>
    api.put<AdminUser>(`${BASE}/profile`, payload) as unknown as Promise<AdminUser>,
  changePassword: (payload: AdminPasswordChange) =>
    api.put<boolean>(`${BASE}/password`, payload) as unknown as Promise<boolean>,
};

const STORAGE_KEY = "research.admin.user";
/**
 * Legacy avatar cache used only when talking to an older backend that did not
 * return avatarUrl. Current profile data is persisted by the server.
 */
const AVATAR_KEY = "research.admin.avatars";

function readAvatarMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AVATAR_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function getStoredAvatar(username?: string): string {
  if (!username) return "";
  return readAvatarMap()[username] || "";
}

export function storeAvatar(username: string, avatarUrl: string) {
  if (!username) return;
  try {
    const map = readAvatarMap();
    if (avatarUrl) {
      map[username] = avatarUrl;
    } else {
      delete map[username];
    }
    localStorage.setItem(AVATAR_KEY, JSON.stringify(map));
  } catch {
    // 隐私模式等场景下 localStorage 会抛错，忽略即可
  }
}

export function getStoredAdminUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminUser;
    // A present server field is authoritative, including an explicit empty value.
    const hasServerAvatar = Object.prototype.hasOwnProperty.call(parsed, "avatarUrl");
    return {
      ...parsed,
      avatarUrl: hasServerAvatar ? (parsed.avatarUrl || "") : getStoredAvatar(parsed.username),
    };
  } catch {
    return null;
  }
}

export function storeAdminUser(user: AdminUser) {
  // Prefer the server value; use the cache only for legacy responses with no field.
  const hasServerAvatar = Object.prototype.hasOwnProperty.call(user, "avatarUrl");
  const avatarUrl = hasServerAvatar ? (user.avatarUrl || "") : getStoredAvatar(user.username);
  // Keep the migration cache in sync so a server-side clear cannot be resurrected.
  storeAvatar(user.username, avatarUrl);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...user,
      avatarUrl
    }));
  } catch {
    // 忽略存储失败，不阻断登录
  }
}

export function storeAuthSession(auth: AdminAuthResponse) {
  storeAdminUser(auth.user);
  storeAccessToken(auth.accessToken);
  storeRefreshToken(auth.refreshToken);
}

export function getAccessToken(): string | null {
  return readAccessToken();
}

export function getRefreshToken(): string | null {
  return readRefreshToken();
}

export function clearAuthSession() {
  clearStoredAdminUser();
  clearAuthTokens();
}

export function clearStoredAdminUser() {
  // 只清账号信息；头像留在 AVATAR_KEY 里，下次登录同一账号自动恢复
  localStorage.removeItem(STORAGE_KEY);
}
