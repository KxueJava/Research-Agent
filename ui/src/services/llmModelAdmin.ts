import api from "./index";

/**
 * 模型接入管理 API（对齐后端 AiClientApi / AiClientModel Admin）。
 * 写库后后端 LlmModelCatalog 会 invalidate，下一请求即可热切换。
 */

export interface LlmApiRecord {
  id?: number;
  apiId: string;
  baseUrl: string;
  apiKey?: string;
  completionsPath?: string;
  embeddingsPath?: string;
  status?: number;
}

export interface LlmModelRecord {
  id: number;
  modelId: string;
  apiId: string;
  modelName: string;
  modelType?: string;
  modelUsage?: string;
  /** 0/1 是否支持深度思考 */
  supportsThinking?: number;
  supportedReasoningEfforts?: string[];
  /** 上下文窗口 token */
  contextWindow?: number | null;
  status?: number;
}

export interface LlmModelUpsertPayload {
  /** 配置行主键；更新时使用，新增时为空 */
  id?: number;
  /** 模型引用标识，可与上游模型名相同且允许重复 */
  modelId: string;
  /** 上游模型名（发给厂商的 model） */
  modelName: string;
  baseUrl: string;
  apiKey: string;
  completionsPath?: string;
  embeddingsPath?: string;
  modelType?: string;
  modelUsage?: string;
  supportsThinking?: number;
  supportedReasoningEfforts?: string[];
  contextWindow?: number | null;
  status?: number;
  /** 复用已有 apiId；空则用 api-{modelId}，冲突时自动生成新 ID */
  apiId?: string;
}

/** 草稿连接测试入参：页面当前值，不落库 */
export interface LlmDraftTestPayload {
  /** 已保存配置 ID；apiKey 为空或掩码时后端用它回退到真实 key */
  id?: number;
  modelName: string;
  baseUrl: string;
  apiKey?: string;
  completionsPath?: string;
}

export interface AvailableModelsPayload {
  /** 新建凭据模式：明文 baseUrl + apiKey */
  baseUrl?: string;
  apiKey?: string;
  /** 复用模式：按已存供应商取 baseUrl 与 key，避免明文 key 出现在浏览器 */
  apiId?: string;
}

/** 对话选择器用：一个供应商下的模型分组（响应不含 apiKey） */
export interface LlmModelGroup {
  apiId: string;
  baseUrl: string;
  models: LlmModelGroupItem[];
}

export interface LlmModelGroupItem {
  id: number;
  modelId: string;
  modelName: string;
  modelUsage?: string;
  supportsThinking?: number;
  supportedReasoningEfforts?: string[];
  contextWindow?: number | null;
}

type LlmModelWritePayload = Omit<LlmModelUpsertPayload, "baseUrl" | "apiKey">;

export function isFallbackModelUsage(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === "fallback" ||
    normalized === "backup" ||
    normalized === "备用" ||
    normalized === "备用模型"
  );
}

const API_BASE = "/api/v1/admin/ai-client-api";
const MODEL_BASE = "/api/v1/admin/ai-client-model";

export const llmModelAdminApi = {
  listApis: () =>
    api.get<LlmApiRecord[]>(`${API_BASE}/query-all`) as unknown as Promise<
      LlmApiRecord[]
    >,

  listEnabledApis: () =>
    api.get<LlmApiRecord[]>(`${API_BASE}/query-enabled`) as unknown as Promise<
      LlmApiRecord[]
    >,

  listModels: () =>
    api.get<LlmModelRecord[]>(`${MODEL_BASE}/query-all`) as unknown as Promise<
      LlmModelRecord[]
    >,

  listEnabledModels: () =>
    api.get<LlmModelRecord[]>(
      `${MODEL_BASE}/query-enabled`
    ) as unknown as Promise<LlmModelRecord[]>,

  /**
   * 启用的模型按供应商分组，供对话输入框做「供应商 → 模型」两级选择。
   * 响应结构上不含 apiKey。
   */
  listEnabledModelGroups: () =>
    api.get<LlmModelGroup[]>(
      `${MODEL_BASE}/query-enabled-grouped`
    ) as unknown as Promise<LlmModelGroup[]>,

  createApi: (payload: LlmApiRecord) =>
    api.post<boolean>(`${API_BASE}/create`, payload) as unknown as Promise<boolean>,

  updateApi: (payload: LlmApiRecord) =>
    api.put<boolean>(
      `${API_BASE}/update-by-api-id`,
      payload
    ) as unknown as Promise<boolean>,

  deleteApi: (apiId: string) =>
    api.delete<boolean>(
      `${API_BASE}/delete-by-api-id/${encodeURIComponent(apiId)}`
    ) as unknown as Promise<boolean>,

  createModel: (payload: LlmModelWritePayload) =>
    api.post<boolean>(
      `${MODEL_BASE}/create`,
      payload
    ) as unknown as Promise<boolean>,

  updateModel: (payload: LlmModelWritePayload) =>
    api.put<boolean>(
      `${MODEL_BASE}/update-by-id`,
      payload
    ) as unknown as Promise<boolean>,

  deleteModel: (id: number) =>
    api.delete<boolean>(
      `${MODEL_BASE}/delete-by-id/${id}`
    ) as unknown as Promise<boolean>,

  /** 真发一次极小请求测选中的具体模型配置 */
  testConnectionById: (id: number) =>
    api.post<{ ok: boolean; ms: number; message?: string }>(
      `${MODEL_BASE}/test-by-id/${id}`
    ) as unknown as Promise<{ ok: boolean; ms: number; message?: string }>,

  /**
   * 用表单当前值测连接，不落库。
   * 让用户能在保存前验证刚填的 key / baseUrl，避免
   * 「填了错的 key，测试却拿库里旧 key 报成功」。
   */
  testDraftConnection: (payload: LlmDraftTestPayload) =>
    api.post<{ ok: boolean; ms: number; message?: string }>(
      `${MODEL_BASE}/test-draft`,
      payload
    ) as unknown as Promise<{ ok: boolean; ms: number; message?: string }>,

  listAvailableModels: (payload: AvailableModelsPayload) =>
    api.post<string[]>(`${MODEL_BASE}/available-models`, payload) as unknown as Promise<string[]>,

  /** 兼容按模型引用测试的接口 */
  testConnection: (modelId: string) =>
    api.post<{ ok: boolean; ms: number; message?: string }>(
      `${MODEL_BASE}/test/${encodeURIComponent(modelId)}`
    ) as unknown as Promise<{ ok: boolean; ms: number; message?: string }>,

  /**
   * 一次提交：写 API 凭据 + 模型绑定。
   * 编辑时若 apiKey 含 • 或为空则先拉旧 API 保留原 key。
   */
  upsertBinding: async (
    payload: LlmModelUpsertPayload,
    options?: {
      isNew?: boolean;
      existingApiKey?: string;
      /** 复用已有供应商：只新增模型绑定，凭据行完全不动 */
      reuseProvider?: boolean;
    }
  ) => {
    const requestedApiId = (payload.apiId || `api-${payload.modelId}`)
      .trim()
      .slice(0, 64);
    let apiId = requestedApiId;
    if (options?.isNew && !payload.apiId) {
      const existingApis = await llmModelAdminApi.listApis();
      if (existingApis.some((api) => api.apiId === apiId)) {
        const suffix = `-${Date.now().toString(36)}`;
        apiId = `${apiId.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
      }
    }
    // 复用已有供应商：凭据行不参与本次写入，因此既不需要明文 key，
    // 也不能再调 createApi（api_id 上有唯一约束，会直接撞）。
    const reuseProvider = Boolean(options?.reuseProvider && payload.apiId);

    const keepKey =
      !payload.apiKey ||
      payload.apiKey.includes("•") ||
      payload.apiKey.includes("*");
    let apiKey = keepKey ? options?.existingApiKey || "" : payload.apiKey;

    // 编辑页展示的是脱敏 key，不能把它回写到数据库。优先重新读取
    // 服务端当前凭据，避免页面缓存中的旧值覆盖用户刚修改的配置。
    if (!options?.isNew && keepKey) {
      const currentApis = await llmModelAdminApi.listApis();
      const currentApi = currentApis.find((api) => api.apiId === apiId);
      apiKey = currentApi?.apiKey || apiKey;
    }

    if (!reuseProvider && !apiKey?.trim()) {
      throw new Error("API Key 不能为空");
    }

    const apiBody: LlmApiRecord = {
      apiId,
      baseUrl: payload.baseUrl.trim(),
      apiKey: apiKey.trim(),
      completionsPath: payload.completionsPath?.trim() || "/chat/completions",
      embeddingsPath: payload.embeddingsPath?.trim() || "/embeddings",
      status: 1,
    };

    const modelBody: LlmModelWritePayload = {
      id: payload.id,
      modelId: payload.modelId.trim(),
      apiId,
      modelName: payload.modelName.trim(),
      modelType: payload.modelType?.trim() || "openai",
      modelUsage: payload.modelUsage?.trim() || "default",
      supportsThinking: payload.supportsThinking ?? 0,
      supportedReasoningEfforts: payload.supportedReasoningEfforts ?? [],
      contextWindow: payload.contextWindow ?? null,
      status: payload.status ?? 1,
    };

    if (reuseProvider) {
      // 只新增模型绑定：凭据行复用已有 apiId，不重复写入 baseUrl / key
      const reused = await llmModelAdminApi.createModel(modelBody);
      if (reused === false) {
        throw new Error("模型配置保存失败");
      }
    } else if (options?.isNew) {
      await llmModelAdminApi.createApi(apiBody);
      await llmModelAdminApi.createModel(modelBody);
    } else {
      if (payload.id == null) {
        throw new Error("模型配置缺少记录 ID");
      }
      try {
        const apiResult = await llmModelAdminApi.updateApi(apiBody);
        if (apiResult === false) {
          throw new Error("API 凭据保存失败");
        }
      } catch {
        const created = await llmModelAdminApi.createApi(apiBody);
        if (created === false) {
          throw new Error("API 凭据保存失败");
        }
      }
      try {
        const modelResult = await llmModelAdminApi.updateModel(modelBody);
        if (modelResult === false) {
          throw new Error("模型配置保存失败");
        }
      } catch {
        const created = await llmModelAdminApi.createModel(modelBody);
        if (created === false) {
          throw new Error("模型配置保存失败");
        }
      }
    }
    return {
      apiId,
      modelId: modelBody.modelId,
    };
  },
};
