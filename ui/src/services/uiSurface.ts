import { getDeviceId } from "./agentConversation";
import { getAccessToken } from "@/utils/authToken";
import { resolveServiceBaseUrl } from "@/utils/origin";

export async function fetchUiSurfaceSnapshots(sessionId: string, signal?: AbortSignal): Promise<unknown[]> {
  const base = resolveServiceBaseUrl(typeof SERVICE_BASE_URL === "string" ? SERVICE_BASE_URL : "");
  const token = getAccessToken();
  const response = await fetch(`${base}/api/agent/conversation/sessions/${encodeURIComponent(sessionId)}/surfaces`, {
    credentials: "include", signal, headers: { "X-Device-Id": getDeviceId(), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error("界面快照暂时不可用");
  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length > 200) throw new Error("界面快照列表无效");
  return data;
}

export async function fetchUiSurface(sessionId: string, surfaceId: string, signal?: AbortSignal): Promise<any> {
  const base=resolveServiceBaseUrl(typeof SERVICE_BASE_URL==="string"?SERVICE_BASE_URL:"");
  const token=getAccessToken();
  const response=await fetch(`${base}/api/agent/conversation/sessions/${encodeURIComponent(sessionId)}/surfaces/${encodeURIComponent(surfaceId)}`,{
    credentials:"include",signal,
    headers:{"X-Device-Id":getDeviceId(),...(token?{Authorization:`Bearer ${token}`}:{})},
  });
  if(!response.ok)throw new Error("界面同步失败，请重试或重新打开会话");
  const data=await response.json();
  if(data.sessionId!==sessionId || data.surfaceId!==surfaceId || !Number.isSafeInteger(data.revision) || !data.tree?.root)
    throw new Error("界面快照无效");
  return data;
}
