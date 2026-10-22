import { getAccessToken } from "@/utils/authToken";
import { adminUserApi, type AdminAuthResponse } from "./adminUser";

const BASE = "/api/v1/admin/github";
export const GITHUB_ATTEMPT_KEY = "research.github.attempt";
type Action = "login" | "bind";
type Attempt = { state: string; action: Action };
export type GitHubBinding = { bound: boolean; login: string | null; passwordLoginAvailable: boolean };
export type GitHubCompleted = { action: Action; auth: AdminAuthResponse | null };

// OAuth cookies must remain same-origin through Vite / the production reverse proxy.
async function call<T>(path: string, payload?: unknown): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${BASE}${path}`, {
    method: payload === undefined ? "GET" : "POST",
    credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(35000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const result = await response.json();
  if (!response.ok || result.code !== "0000") throw new Error(result.info || "GitHub 登录暂不可用，请稍后重试");
  return result.data as T;
}

export const githubAuth = {
  config: () => call<{ enabled: boolean }>("/config"),
  binding: async () => { await adminUserApi.me(); return call<GitHubBinding>("/binding"); },
  start: async (action: Action) => {
    if (action === "bind") await adminUserApi.me();
    const result = await call<{ authorizationUrl: string; state: string; callbackOrigin: string }>(
      action === "bind" ? "/bind/start" : "/start", {});
    if (result.callbackOrigin !== window.location.origin) {
      throw new Error(`请使用 ${result.callbackOrigin} 打开项目后再进行 GitHub 登录`);
    }
    const target = new URL(result.authorizationUrl);
    if (target.origin !== "https://github.com" || target.pathname !== "/login/oauth/authorize") {
      throw new Error("GitHub 授权地址无效，请检查服务端配置");
    }
    sessionStorage.setItem(GITHUB_ATTEMPT_KEY, JSON.stringify({ state: result.state, action }));
    window.location.assign(result.authorizationUrl);
  },
  complete: async (params: URLSearchParams): Promise<GitHubCompleted> => {
    const raw = sessionStorage.getItem(GITHUB_ATTEMPT_KEY);
    let attempt: Attempt | null = null;
    try { attempt = raw ? JSON.parse(raw) as Attempt : null; }
    catch { sessionStorage.removeItem(GITHUB_ATTEMPT_KEY); }
    if (!attempt || !params.get("state") || attempt.state !== params.get("state")) {
      throw new Error("GitHub 授权无效或已过期，请返回重新登录");
    }
    sessionStorage.removeItem(GITHUB_ATTEMPT_KEY);
    if (attempt.action === "bind") await adminUserApi.me();
    return call<GitHubCompleted>("/complete", {
      code: params.get("code"), state: params.get("state"), error: params.get("error"),
    });
  },
};
