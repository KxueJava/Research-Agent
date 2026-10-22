import { getAccessToken } from "@/utils/authToken";
import { refreshAccessToken } from "@/utils/request";
import { resolveServiceBaseUrl } from "@/utils/origin";
import { getDeviceId } from "./agentConversation";
import { readHtmlDocument } from "@/utils/chat/htmlSurfaces";

export async function fetchHtmlSurface(session: string, surface: string, revision?: number, signal?: AbortSignal) {
  const base = resolveServiceBaseUrl(typeof SERVICE_BASE_URL === "string" ? SERVICE_BASE_URL : "");
  const url = `${base}/api/agent/conversation/sessions/${encodeURIComponent(session)}/surfaces/${encodeURIComponent(surface)}${revision ? `/versions/${revision}` : ""}`;
  const read = (token: string | null) => fetch(url, { credentials: "include", signal,
    headers: { "X-Device-Id": getDeviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  let response = await read(getAccessToken());
  if (response.status === 401 && !signal?.aborted) {
    const token = await refreshAccessToken();
    if (token && !signal?.aborted) response = await read(token);
  }
  if (!response.ok) throw new Error("版本读取失败，请重试或重新登录");
  const doc = readHtmlDocument(await response.json(), session, surface, revision);
  if (!doc) throw new Error("HTML 版本信息无效");
  return doc;
}
