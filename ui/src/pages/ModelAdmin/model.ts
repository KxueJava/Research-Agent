import {
  isFallbackModelUsage,
  type LlmApiRecord,
  type LlmModelRecord,
  type LlmModelUpsertPayload,
} from "@/services/llmModelAdmin";

import { matchProviderId, type ProviderPreset } from "./meta";

/** 详情面板的可编辑状态（模型记录 + 其 API 凭据记录的合并视图） */
export type EditorState = {
  id?: number;
  modelId: string;
  modelName: string;
  baseUrl: string;
  apiKey: string;
  completionsPath: string;
  embeddingsPath: string;
  modelType: string;
  modelUsage: string;
  isFallback: boolean;
  supportsThinking: number;
  supportedReasoningEfforts: string[];
  contextWindow: number | null;
  status: number;
  apiId?: string;
  existingApiKey?: string;
  providerId: string;
  /** 仅新增弹窗使用：从「获取可用模型」批量勾选的模型名 */
  selectedModelNames?: string[];
};

export type TestResult = { ok: boolean; ms: number; message?: string };

/** 仅存在于前端的运行时观测量，来自「测试连接」，不落库 */
export type ModelRuntime = { ms?: number; testedAt?: number };

export type ProviderTab = ProviderPreset & { count: number };

export const ALL_PROVIDERS = "all";

export function modelKey(model: LlmModelRecord) {
  return String(model.id);
}

export function maskKey(key?: string) {
  if (!key) return "";
  if (key.length <= 10) return "••••";
  return `${key.slice(0, 6)}••••${key.slice(-4)}`;
}

export function emptyEditor(preset?: ProviderPreset): EditorState {
  return {
    modelId: "",
    modelName: "",
    baseUrl: preset?.baseUrl ?? "https://www.micuapi.ai/v1",
    apiKey: "",
    completionsPath: preset?.completionsPath ?? "/chat/completions",
    embeddingsPath: "/embeddings",
    modelType: "openai",
    modelUsage: "default",
    isFallback: false,
    supportsThinking: 0,
    supportedReasoningEfforts: [],
    contextWindow: null,
    status: 1,
    providerId: preset?.id ?? "micu",
    selectedModelNames: [],
  };
}

export function toEditor(
  model: LlmModelRecord,
  api?: LlmApiRecord,
): EditorState {
  const modelUsage = model.modelUsage || "default";
  return {
    id: model.id,
    modelId: model.modelId,
    modelName: model.modelName,
    baseUrl: api?.baseUrl || "",
    apiKey: maskKey(api?.apiKey),
    existingApiKey: api?.apiKey,
    completionsPath: api?.completionsPath || "/chat/completions",
    embeddingsPath: api?.embeddingsPath || "/embeddings",
    modelType: model.modelType || "openai",
    modelUsage,
    isFallback: isFallbackModelUsage(modelUsage),
    supportsThinking: model.supportsThinking ?? 0,
    supportedReasoningEfforts: model.supportedReasoningEfforts ?? [],
    contextWindow: model.contextWindow ?? null,
    status: model.status ?? 1,
    apiId: model.apiId,
    providerId: matchProviderId(api?.baseUrl),
  };
}

export function toPayload(state: EditorState): LlmModelUpsertPayload {
  return {
    id: state.id,
    modelId: state.modelId.trim(),
    modelName: state.modelName.trim(),
    baseUrl: state.baseUrl.trim(),
    apiKey: state.apiKey,
    completionsPath: state.completionsPath.trim() || "/chat/completions",
    embeddingsPath: state.embeddingsPath.trim() || "/embeddings",
    modelType: state.modelType.trim() || "openai",
    modelUsage: state.isFallback
      ? "fallback"
      : isFallbackModelUsage(state.modelUsage)
        ? "default"
        : state.modelUsage.trim() || "default",
    supportsThinking: state.supportsThinking ?? 0,
    supportedReasoningEfforts: state.supportedReasoningEfforts,
    contextWindow: state.contextWindow,
    status: state.status,
    apiId: state.apiId,
  };
}

/** 相对时间；测试观测只存在于内存，页面重渲染时刷新即可 */
export function relativeTime(testedAt?: number): string {
  if (!testedAt) return "未测试";
  const minutes = Math.floor((Date.now() - testedAt) / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

/** 服务商 tab：只展示当前实际接入的服务商，避免空 tab */
export function providerTabs(
  models: LlmModelRecord[],
  apiMap: Map<string, LlmApiRecord>,
  presets: ProviderPreset[],
): ProviderTab[] {
  const counted = presets.map((preset) => ({
    ...preset,
    count: models.filter(
      (model) =>
        matchProviderId(apiMap.get(model.apiId)?.baseUrl) === preset.id,
    ).length,
  }));
  return counted.filter((tab) => tab.count > 0);
}

export function filterModels(
  models: LlmModelRecord[],
  apiMap: Map<string, LlmApiRecord>,
  providerId: string,
  query: string,
): LlmModelRecord[] {
  const keyword = query.trim().toLowerCase();
  return models.filter((model) => {
    const baseUrl = apiMap.get(model.apiId)?.baseUrl ?? "";
    if (
      providerId !== ALL_PROVIDERS &&
      matchProviderId(baseUrl) !== providerId
    ) {
      return false;
    }
    if (!keyword) return true;
    return (
      model.modelId.toLowerCase().includes(keyword) ||
      model.modelName.toLowerCase().includes(keyword) ||
      baseUrl.toLowerCase().includes(keyword)
    );
  });
}
