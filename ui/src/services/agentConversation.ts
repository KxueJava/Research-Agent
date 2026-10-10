import api from "./index";

const DEFAULT_DEVICE_ID = "device-default";

let runtimeDeviceId: string | null = DEFAULT_DEVICE_ID;

/**
 * 当前前端已经移除历史对话持久化，只保留一个轻量设备标识，
 * 兼容仍然需要该请求头的上传和流式接口。
 */
export function getDeviceId(): string {
  if (!runtimeDeviceId) {
    runtimeDeviceId = DEFAULT_DEVICE_ID;
  }
  return runtimeDeviceId;
}

export function getDeviceHeaders(): Record<string, string> {
  return { "X-Device-Id": getDeviceId() };
}

export interface VisitorBootstrapInfo {
  visitorId: string;
  username?: string;
  named: boolean;
}

export interface ConversationSessionItem {
  sessionId: string;
  title: string;
  status: string;
  latestQueryText: string;
  runCount: number;
  finishedRunCount: number;
  failedRunCount: number;
  startedAt: string;
  lastActiveAt: string;
  /** 是否置顶。后端列表已按置顶优先排序。 */
  pinned?: boolean;
}

export interface ConversationReplayFrame {
  reqId: string;
  status: string;
  finished: boolean;
  resultMap: {
    agentType?: string;
    multiAgent?: Record<string, unknown>;
    eventData?: MESSAGE.EventData;
  };
}

export interface ConversationContextUsage {
  max: number;
  promptTokens?: number;
}

export interface ConversationHistoryRunDetail {
  requestId: string;
  status: string;
  queryText: string;
  finalSummaryText?: string;
  startedAt?: string;
  finishedAt?: string;
  contextUsage?: ConversationContextUsage;
  replayFrames: ConversationReplayFrame[];
}

export interface ConversationHistoryDetail {
  sessionId: string;
  title: string;
  status: string;
  deepThink: boolean;
  runCount: number;
  finishedRunCount: number;
  failedRunCount: number;
  startedAt?: string;
  lastActiveAt?: string;
  runs: ConversationHistoryRunDetail[];
}

export const visitorApi = {
  bootstrap: () =>
    api.get<VisitorBootstrapInfo>(`/api/agent/visitor/bootstrap`) as unknown as Promise<VisitorBootstrapInfo>,
  naming: (username: string) =>
    api.post<VisitorBootstrapInfo>(`/api/agent/visitor/naming`, { username }) as unknown as Promise<VisitorBootstrapInfo>,
};

export const conversationHistoryApi = {
  listSessions: (limit = 20) =>
    api.get<ConversationSessionItem[]>(
      `/api/agent/conversation/sessions?limit=${limit}`
    ) as unknown as Promise<ConversationSessionItem[]>,
  getSessionDetail: (sessionId: string) =>
    api.get<ConversationHistoryDetail>(
      `/api/agent/conversation/sessions/${sessionId}`
    ) as unknown as Promise<ConversationHistoryDetail>,
  /** 物理删除会话：清空账本/工作记忆并删除磁盘工作区 */
  deleteSession: (sessionId: string) =>
    api.delete<boolean>(
      `/api/agent/conversation/sessions/${encodeURIComponent(sessionId)}`
    ) as unknown as Promise<boolean>,
  /** 置顶 / 取消置顶。必须显式传目标状态，后端不接受缺省语义。 */
  pinSession: (sessionId: string, pinned: boolean) =>
    api.put<boolean>(
      `/api/agent/conversation/sessions/${encodeURIComponent(sessionId)}/pin`,
      { pinned }
    ) as unknown as Promise<boolean>,
};
