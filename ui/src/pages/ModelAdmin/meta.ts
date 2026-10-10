/**
 * 模型接入页展示元数据。
 *
 * 供应商预设已抽到 @/utils/llmProviders 供对话选择器共用，这里只做转出，
 * 保持既有 `./meta` 引用不变。
 */

export {
  PROVIDER_PRESETS,
  matchProviderId,
  providerDisplayName,
  providerMark,
  providerPreset,
  type ProviderPreset,
} from "@/utils/llmProviders";
