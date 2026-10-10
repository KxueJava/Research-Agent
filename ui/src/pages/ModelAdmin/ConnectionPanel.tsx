import type { ReactNode } from "react";
import classNames from "classnames";
import { Check, Eye, EyeOff, Info, Loader2, Zap } from "lucide-react";
import { Checkbox, Switch } from "antd";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import type { EditorState, TestResult } from "./model";
import { PROVIDER_PRESETS, type ProviderPreset } from "./meta";

type ConnectionPanelProps = {
  editor: EditorState;
  provider: ProviderPreset;
  dirty: boolean;
  saving: boolean;
  testing: boolean;
  testResult: TestResult | null;
  keyVisible: boolean;
  onToggleKey: () => void;
  onPatch: (patch: Partial<EditorState>) => void;
  onApplyProvider: (providerId: string) => void;
  onTest: () => void;
  onSave: () => void;
  onRevert: () => void;
};

function Field({
  id,
  label,
  hint,
  required,
  className,
  children,
}: {
  id?: string;
  label: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={classNames("model-admin-field", className)}>
      <label className="workspace-admin-field-label" htmlFor={id}>
        {label}
        {required ? <span className="text-[var(--color-danger)]"> *</span> : null}
      </label>
      {children}
      {hint ? <span className="workspace-admin-field-hint">{hint}</span> : null}
    </div>
  );
}

/** 连接配置面板：固定头 + 滚动表单体 + 固定操作栏 */
export default function ConnectionPanel({
  editor,
  provider,
  dirty,
  saving,
  testing,
  testResult,
  keyVisible,
  onToggleKey,
  onPatch,
  onApplyProvider,
  onTest,
  onSave,
  onRevert,
}: ConnectionPanelProps) {
  const enabled = editor.status === 1;
  const custom = editor.providerId === "custom";
  const patch = (key: keyof EditorState, value: EditorState[keyof EditorState]) =>
    onPatch({ [key]: value } as Partial<EditorState>);

  return (
    <section className="model-admin-panel">
      <div className="model-admin-panel-head">
        <span
          className="model-admin-mark"
          style={{ background: provider.color }}
          aria-hidden="true"
        >
          {provider.letter}
        </span>
        <div className="model-admin-panel-heading">
          <div className="model-admin-panel-title">
            {editor.modelName || "未命名模型"}
          </div>
          <div className="model-admin-panel-sub">
            {editor.modelId} · 修改后下一轮对话生效
          </div>
        </div>
        <span className="workspace-admin-status" data-disabled={!enabled}>
          <span className="workspace-admin-status-dot" aria-hidden="true" />
          {enabled ? "已启用" : "已停用"}
        </span>
        <Switch
          checked={enabled}
          onChange={(checked) => patch("status", checked ? 1 : 0)}
          aria-label="启用该模型"
        />
      </div>

      <div className="model-admin-panel-body">
        <div className="model-admin-section">
          <div className="model-admin-section-title">服务商</div>
          <div className="model-admin-grid">
            <Field
              id="model-provider"
              label="服务商预设"
              hint="选择预设会自动填充 Base URL 与 Completions 路径"
            >
              <select
                id="model-provider"
                className="workspace-admin-select"
                value={editor.providerId}
                onChange={(event) => onApplyProvider(event.target.value)}
              >
                {PROVIDER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id="model-type"
              label="模型类型"
              hint="决定请求体适配方式"
            >
              <Input
                id="model-type"
                value={editor.modelType}
                placeholder="openai / deepseek / claude"
                onChange={(event) => patch("modelType", event.target.value)}
              />
            </Field>

            <Field
              id="model-base-url"
              label="Base URL"
              required
              className="model-admin-span2"
              hint={
                custom
                  ? "自定义模式：手填兼容 OpenAI 的地址"
                  : "由所选服务商预设；切成「自定义」可手填"
              }
            >
              <Input
                id="model-base-url"
                value={editor.baseUrl}
                readOnly={!custom}
                className={classNames(
                  "font-mono text-[12.5px]",
                  !custom &&
                    "bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]",
                )}
                onChange={(event) => patch("baseUrl", event.target.value)}
              />
            </Field>
          </div>

          {provider.keyHint && !custom ? (
            <div className="workspace-admin-callout mt-3">
              <Info aria-hidden="true" />
              <span>{provider.keyHint}</span>
            </div>
          ) : null}
        </div>

        <div className="model-admin-section">
          <div className="model-admin-section-title">模型与凭据</div>
          <div className="model-admin-grid">
            <Field
              id="model-name"
              label="模型标识（上游 model）"
              required
              hint="与厂商文档逐字一致"
            >
              <Input
                id="model-name"
                value={editor.modelName}
                className="font-mono text-[12.5px]"
                placeholder="gpt-4o / claude-3-5-sonnet"
                onChange={(event) =>
                  onPatch({
                    modelName: event.target.value,
                    modelId: editor.modelId || event.target.value,
                  })
                }
              />
            </Field>

            <Field
              id="model-id"
              label="模型 ID（业务主键）"
              hint="对话侧引用，创建后不可改"
            >
              <Input
                id="model-id"
                value={editor.modelId}
                readOnly
                className="bg-[var(--color-surface-sunken)] font-mono text-[12.5px] text-[var(--color-text-muted)]"
              />
            </Field>

            <Field
              id="model-api-key"
              label="API Key"
              required
              className="model-admin-span2"
              hint="脱敏保存；要轮换 key 请重新输入明文"
            >
              <div className="model-admin-input-wrap">
                <Input
                  id="model-api-key"
                  type={keyVisible ? "text" : "password"}
                  value={editor.apiKey}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-[12.5px]"
                  placeholder="sk-…"
                  onChange={(event) => patch("apiKey", event.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggleKey}
                  aria-pressed={keyVisible}
                  title={keyVisible ? "隐藏 API Key" : "显示 API Key"}
                  aria-label={keyVisible ? "隐藏 API Key" : "显示 API Key"}
                >
                  {keyVisible ? (
                    <EyeOff className="size-3.5" />
                  ) : (
                    <Eye className="size-3.5" />
                  )}
                </Button>
              </div>
            </Field>

            <Field id="model-completions" label="Completions 路径">
              <Input
                id="model-completions"
                value={editor.completionsPath}
                className="font-mono text-[12.5px]"
                onChange={(event) =>
                  patch("completionsPath", event.target.value)
                }
              />
            </Field>

            <Field id="model-embeddings" label="Embeddings 路径">
              <Input
                id="model-embeddings"
                value={editor.embeddingsPath}
                className="font-mono text-[12.5px]"
                onChange={(event) => patch("embeddingsPath", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="model-admin-section">
          <div className="model-admin-section-title">能力与路由</div>
          <div className="model-admin-grid">
            <Field
              id="model-context-window"
              label="上下文窗口（token）"
              hint="用于上下文预算与压缩阈值"
            >
              <Input
                id="model-context-window"
                type="number"
                min={0}
                step={1000}
                inputMode="numeric"
                value={editor.contextWindow ?? ""}
                placeholder="如 128000"
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  patch(
                    "contextWindow",
                    raw === "" ? null : Number(raw) || null,
                  );
                }}
              />
            </Field>

            <div className="model-admin-field-toggles">
              <div className="flex items-center gap-2 pb-1 text-[13px] text-[var(--color-text)]">
                <Switch
                  checked={editor.supportsThinking === 1}
                  onChange={(checked) =>
                    patch("supportsThinking", checked ? 1 : 0)
                  }
                  aria-label="支持深度思考"
                />
                <span>支持深度思考</span>
              </div>
              <Checkbox
                checked={editor.isFallback}
                onChange={(event) => patch("isFallback", event.target.checked)}
              >
                备用模型
              </Checkbox>
              <span className="workspace-admin-field-hint mt-1 pl-6">
                主模型失败后按配置顺序尝试
              </span>
            </div>
          </div>
          <div className="model-admin-field mt-4">
            <span className="workspace-admin-field-label">上游支持的推理强度</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {["low", "medium", "high", "max", "ultra"].map((level) => (
                <Checkbox
                  key={level}
                  checked={editor.supportedReasoningEfforts.includes(level)}
                  onChange={(event) => onPatch({
                    supportedReasoningEfforts: ["low", "medium", "high", "max", "ultra"].filter((item) =>
                      event.target.checked
                        ? editor.supportedReasoningEfforts.includes(item) || item === level
                        : editor.supportedReasoningEfforts.includes(item) && item !== level,
                    ),
                  })}
                >
                  <span className="capitalize">{level}</span>
                </Checkbox>
              ))}
            </div>
            <span className="workspace-admin-field-hint">只勾选已向上游确认支持的档位；未勾选时子 Agent 使用模型默认值。</span>
          </div>
        </div>
      </div>

      <div className="model-admin-panel-foot">
        <Button
          type="button"
          variant="outline"
          className="workspace-admin-secondary"
          disabled={testing || editor.id == null}
          onClick={onTest}
          title="用当前表单里的值测试，不会保存"
        >
          {testing ? (
            <Loader2 className="mr-1 size-[15px] animate-spin" />
          ) : (
            <Zap className="mr-1 size-[15px]" />
          )}
          测试连接
        </Button>

        {testResult ? (
          <span
            className="model-admin-result"
            data-ok={testResult.ok}
            role="status"
            aria-live="polite"
          >
            {testResult.ok ? (
              <>
                <Check className="size-[15px]" strokeWidth={2.2} />
                连接成功 · 延迟 {testResult.ms} ms
              </>
            ) : (
              (testResult.message ?? "连接失败")
            )}
          </span>
        ) : null}

        <span className="ml-auto" />

        <Button
          type="button"
          variant="ghost"
          disabled={!dirty}
          onClick={onRevert}
        >
          放弃改动
        </Button>
        <Button
          type="button"
          className="workspace-admin-primary"
          disabled={saving || !dirty}
          onClick={onSave}
        >
          {saving ? "保存中…" : dirty ? "保存模型" : "已保存"}
        </Button>
      </div>
    </section>
  );
}
