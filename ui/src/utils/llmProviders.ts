/**
 * 供应商预设与展示元数据。
 *
 * 原先只服务于模型接入页（pages/ModelAdmin/meta.ts），现在对话输入框的
 * 「供应商 → 模型」选择器也要用，因此抽到共用层，避免 components 反向依赖 pages。
 */

export type ProviderPreset = {
  id: string;
  label: string;
  baseUrl: string;
  completionsPath: string;
  keyHint: string;
  /** 列表卡片上的方形标记底色（不伪造厂商 logo，用字母标记代替） */
  color: string;
  /** 标记内的字母 */
  letter: string;
};

/** 常用厂商预设：选中后自动填 baseUrl / path，key 仍手填 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "micu",
    label: "Micu / 兼容中转",
    baseUrl: "https://www.micuapi.ai/v1",
    completionsPath: "/chat/completions",
    keyHint: "中转站后台复制 API Key",
    color: "#0e7490",
    letter: "M",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    completionsPath: "/chat/completions",
    keyHint: "platform.openai.com → API keys",
    color: "#10a37f",
    letter: "O",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    completionsPath: "/chat/completions",
    keyHint: "platform.deepseek.com",
    color: "#4d6bfe",
    letter: "D",
  },
  {
    id: "moonshot",
    label: "Kimi / Moonshot",
    baseUrl: "https://api.moonshot.cn/v1",
    completionsPath: "/chat/completions",
    keyHint: "platform.moonshot.cn",
    color: "#7c3aed",
    letter: "K",
  },
  {
    id: "custom",
    label: "自定义",
    baseUrl: "",
    completionsPath: "/chat/completions",
    keyHint: "手填 Base URL 与 Key",
    color: "#64748b",
    letter: "*",
  },
];

/** 取服务商预设，未命中回退「自定义」 */
export function providerPreset(providerId?: string): ProviderPreset {
  return (
    PROVIDER_PRESETS.find((p) => p.id === providerId) ??
    PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
  );
}

export function matchProviderId(baseUrl?: string): string {
  const u = (baseUrl || "").trim().toLowerCase();
  if (!u) return "custom";
  const hit = PROVIDER_PRESETS.find(
    (p) => p.id !== "custom" && p.baseUrl && u.startsWith(p.baseUrl.toLowerCase())
  );
  return hit?.id ?? "custom";
}

function hostOf(baseUrl?: string): string {
  return (baseUrl || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .split("/")[0];
}

/**
 * 供应商展示名：命中预设用预设名，否则回退到 baseUrl 主机名。
 * ai_client_api 没有别名列，这里纯前端推断，零 SQL 迁移。
 */
export function providerDisplayName(baseUrl?: string): string {
  const preset = providerPreset(matchProviderId(baseUrl));
  if (preset.id !== "custom") return preset.label;
  return hostOf(baseUrl) || "自定义";
}

/** 供应商方形标记：命中预设用预设字母，否则用主机名首字母 */
export function providerMark(baseUrl?: string): {
  color: string;
  letter: string;
} {
  const preset = providerPreset(matchProviderId(baseUrl));
  if (preset.id !== "custom") {
    return {
      color: preset.color,
      letter: preset.letter
    };
  }
  const host = hostOf(baseUrl);
  return {
    color: preset.color,
    letter: (host.charAt(0) || "*").toUpperCase()
  };
}
