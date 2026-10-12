import { fetchEventSource, EventSourceMessage } from '@microsoft/fetch-event-source';

import { getDeviceId } from '@/services/agentConversation';
import { resolveServiceBaseUrl } from './origin';
import { getAccessToken } from './authToken';
import { noAuth, refreshAccessToken } from './request';

class SSEHandshakeError extends Error {}

/**
 * Research Agent SSE 客户端适配器。
 *
 * <p>该模块只负责建立 POST SSE 连接、解析顶层 JSON 和转发 open/message/error/close
 * 生命周期；事件业务语义由调用方和 {@code sseParsers} 负责，避免网络层绑定具体任务模型。</p>
 */
const customHost = resolveServiceBaseUrl(SERVICE_BASE_URL);
/**
 * 历史会话接口已下线，主聊天统一回到当前仍然保留的 Research SSE 入口。
 */
const DEFAULT_SSE_URL = `${customHost}/web/api/v1/gpt/queryAgentStreamIncr`;

const BASE_SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'Accept': 'text/event-stream',
};

function getSseHeaders(): Record<string, string> {
  const accessToken = getAccessToken();
  return {
    ...BASE_SSE_HEADERS,
    'X-Device-Id': getDeviceId(),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

interface SSEConfig<TMessage = unknown> {
  body: unknown;
  method?: 'GET' | 'POST';
  signal?: AbortSignal;
  /** 是否允许 fetch-event-source 在连接失败后自动重发请求。 */
  retryOnError?: boolean;
  /** 收到带 id 的业务事件时通知调用方保存游标。 */
  handleEventId?: (eventId: string) => void;
  /** HTTP SSE 响应成功建立后通知调用方。 */
  handleOpen?: () => void;
  parser?: (raw: unknown) => TMessage;
  handleMessage: (data: TMessage) => void;
  handleError: (error: Error) => void;
  handleClose: () => void;
}

/**
 * 创建服务器发送事件（SSE）连接
 * @param config SSE 配置
 * @param url 可选的自定义 URL
 */
export default <TMessage = unknown>(
  config: SSEConfig<TMessage>,
  url: string = DEFAULT_SSE_URL
): void => {
  const {
    body = null,
    method = 'POST',
    signal,
    // 当前入口使用 POST；默认不重发原始请求，避免断线后重复创建任务。
    retryOnError = false,
    handleEventId,
    handleOpen,
    parser,
    handleMessage,
    handleError,
    handleClose,
  } = config;

  void fetchEventSource(url, {
    method,
    credentials: 'include',
    headers: getSseHeaders(),
    signal,
    body: method === 'GET' ? undefined : JSON.stringify(body),
    openWhenHidden: true,
    async onopen(response) {
      if (signal?.aborted) return;
      if (!response.ok) {
        if (response.status === 401) {
          const token = await refreshAccessToken();
          if (signal?.aborted) return;
          if (!token) noAuth();
          // 只刷新认证；绝不在此自动重发创建任务的 POST。
          throw new SSEHandshakeError(token
            ? '登录凭证已刷新，请重新发送请求重试'
            : '登录已失效，请重新登录');
        }
        throw new SSEHandshakeError(`SSE 请求失败（HTTP ${response.status}）`);
      }
      const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (contentType !== 'text/event-stream' || !response.body) {
        throw new SSEHandshakeError('服务器未返回有效的 SSE 数据流');
      }
      handleOpen?.();
    },
    onmessage(event: EventSourceMessage) {
      if (event.id) {
        handleEventId?.(event.id);
      }
      if (event.data) {
        try {
          const parsedData = JSON.parse(event.data);
          handleMessage(parser ? parser(parsedData) : (parsedData as TMessage));
        } catch (error) {
          console.error('Error parsing SSE message:', error);
          // 单条协议帧解析失败不等于连接断开；保留连接并等待后续帧，
          // 避免把后端新增字段或脏帧误报成“任务仍在后台执行”。
        }
      }
    },
    onerror(error: Error) {
      console.error('SSE error:', error);
      // POST 流默认不重发原始请求，避免断线后重复 dispatch；需要恢复时由调用方
      // 使用已保存的 run 状态建立 follow 连接。
      if (!retryOnError || error instanceof SSEHandshakeError) {
        throw error;
      }
      handleError(error);
    },
    onclose() {
      console.log('SSE connection closed');
      handleClose();
    }
  }).catch((error: unknown) => {
    // 主动 abort 是组件生命周期清理，不应冒泡成对话失败。
    if (
      signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    ) {
      return;
    }
    handleError(error instanceof Error ? error : new Error(String(error)));
  });
};
