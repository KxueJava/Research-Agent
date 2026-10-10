import { Clock, Loader2, Trash2, Zap } from "lucide-react";
import type { LlmModelRecord } from "@/services/llmModelAdmin";
import { isFallbackModelUsage } from "@/services/llmModelAdmin";
import { Button } from "@/components/ui/button";

import type { ModelRuntime } from "./model";
import { relativeTime } from "./model";
import type { ProviderPreset } from "./meta";

type ModelCardProps = {
  model: LlmModelRecord;
  baseUrl: string;
  showBaseUrl?: boolean;
  provider: ProviderPreset;
  active: boolean;
  runtime?: ModelRuntime;
  busy: boolean;
  onSelect: () => void;
  onTest: () => void;
  onDelete: () => void;
};

/**
 * 模型卡片。外层是 div，主点击区是 button，快捷操作是它的兄弟节点，
 * 避免 button 嵌套 button 的非法结构。
 */
export default function ModelCard({
  model,
  baseUrl,
  showBaseUrl = true,
  provider,
  active,
  runtime,
  busy,
  onSelect,
  onTest,
  onDelete,
}: ModelCardProps) {
  const enabled = (model.status ?? 1) === 1;
  const isFallback = isFallbackModelUsage(model.modelUsage);

  return (
    <div className="model-admin-card" data-active={active}>
      <button
        type="button"
        className="model-admin-card-main"
        onClick={onSelect}
        aria-current={active}
      >
        <span
          className="model-admin-mark"
          style={{ background: provider.color }}
          aria-hidden="true"
        >
          {provider.letter}
        </span>

        <span className="model-admin-card-body">
          <span className="model-admin-card-name">
            <span
              className="model-admin-dot"
              data-off={!enabled}
              aria-hidden="true"
            />
            <span>{model.modelName || model.modelId}</span>
          </span>

          {showBaseUrl && baseUrl ? (
            <span className="model-admin-card-url" title={baseUrl}>
              {baseUrl}
            </span>
          ) : null}

          <span className="model-admin-card-meta">
            <span>
              <Clock className="size-3" aria-hidden="true" />
              {relativeTime(runtime?.testedAt)}
            </span>
            {runtime?.ms ? <span>{runtime.ms} ms</span> : null}
            {model.contextWindow ? (
              <span>{Math.round(model.contextWindow / 1000)}K 上下文</span>
            ) : null}
            {isFallback ? (
              <span className="model-admin-tag" data-tone="warn">
                备用
              </span>
            ) : null}
            {model.supportsThinking === 1 ? (
              <span className="model-admin-tag" data-tone="accent">
                深度思考
              </span>
            ) : null}
          </span>
        </span>
      </button>

      <div className="model-admin-card-actions">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={busy}
          onClick={onTest}
          title="测试连接"
          aria-label={`测试 ${model.modelId} 的连接`}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Zap className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="workspace-admin-danger"
          onClick={onDelete}
          title="删除模型"
          aria-label={`删除模型 ${model.modelId}`}
        >
          <Trash2 className="size-3.5" strokeWidth={2} />
        </Button>
      </div>
    </div>
  );
}
