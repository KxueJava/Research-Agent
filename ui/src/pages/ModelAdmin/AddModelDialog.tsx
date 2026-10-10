import classNames from "classnames";
import { Checkbox } from "antd";
import { Loader2, List } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { LlmApiRecord } from "@/services/llmModelAdmin";

import type { EditorState } from "./model";
import { PROVIDER_PRESETS } from "./meta";

type AddModelDialogProps = {
  open: boolean;
  form: EditorState;
  /** 已存在的供应商凭据，用于「复用已有供应商」 */
  providers: LlmApiRecord[];
  /** 已登记的模型 ID，用于把「获取可用模型」里已存在的项标灰 */
  existingModelIds: string[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onProviderChange: (providerId: string) => void;
  onPatch: (patch: Partial<EditorState>) => void;
  onSubmit: () => void;
  availableModels: string[];
  loadingModels: boolean;
  onLoadModels: () => void;
};

export default function AddModelDialog({
  open,
  form,
  providers,
  existingModelIds,
  saving,
  onOpenChange,
  onProviderChange,
  onPatch,
  onSubmit,
  availableModels,
  loadingModels,
  onLoadModels,
}: AddModelDialogProps) {
  const custom = form.providerId === "custom";
  // apiId 有值即代表复用某条已存凭据；此时 baseUrl / key 都不再手填
  const reuseMode = Boolean(form.apiId);
  const canLoadModels = reuseMode
    ? Boolean(form.apiId)
    : Boolean(form.baseUrl.trim() && form.apiKey.trim());
  // 勾选了「获取可用模型」里的条目即进入批量模式：一次创建多条模型行
  const selectedNames = form.selectedModelNames ?? [];
  const batchMode = selectedNames.length > 0;
  const toggleSelectedModel = (model: string, checked: boolean) => {
    onPatch({
      selectedModelNames: checked
        ? [...selectedNames, model]
        : selectedNames.filter((name) => name !== model),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增模型</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="model-admin-field">
            <label
              className="workspace-admin-field-label"
              htmlFor="add-credential-source"
            >
              凭据来源
            </label>
            <select
              id="add-credential-source"
              className="workspace-admin-select"
              value={reuseMode ? "reuse" : "new"}
              onChange={(event) => {
                if (event.target.value === "reuse") {
                  const first = providers[0];
                  onPatch({
                    apiId: first?.apiId,
                    baseUrl: first?.baseUrl ?? "",
                    completionsPath:
                      first?.completionsPath ?? "/chat/completions",
                    apiKey: "",
                  });
                  return;
                }
                onPatch({
                  apiId: undefined,
                  apiKey: ""
                });
              }}
            >
              <option value="new">新建供应商凭据</option>
              <option value="reuse" disabled={!providers.length}>
                复用已有供应商
                {providers.length ? `（${providers.length} 个）` : "（暂无）"}
              </option>
            </select>
            <span className="workspace-admin-field-hint">
              {reuseMode
                ? "复用该供应商的 Base URL 与 API Key，无需重新输入"
                : "为该模型单独保存一份 Base URL 与 API Key"}
            </span>
          </div>

          {reuseMode ? (
            <div className="model-admin-field">
              <label
                className="workspace-admin-field-label"
                htmlFor="add-reuse-provider"
              >
                选择供应商
              </label>
              <select
                id="add-reuse-provider"
                className="workspace-admin-select"
                value={form.apiId ?? ""}
                onChange={(event) => {
                  const picked = providers.find(
                    (item) => item.apiId === event.target.value,
                  );
                  onPatch({
                    apiId: picked?.apiId,
                    baseUrl: picked?.baseUrl ?? "",
                    completionsPath:
                      picked?.completionsPath ?? "/chat/completions",
                  });
                }}
              >
                {providers.map((item) => (
                  <option key={item.apiId} value={item.apiId}>
                    {item.baseUrl}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="model-admin-field">
              <label
                className="workspace-admin-field-label"
                htmlFor="add-provider"
              >
                服务商
              </label>
              <select
                id="add-provider"
                className="workspace-admin-select"
                value={form.providerId}
                onChange={(event) => onProviderChange(event.target.value)}
              >
                {PROVIDER_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="model-admin-field">
            <label className="workspace-admin-field-label" htmlFor="add-base-url">
              Base URL
              {reuseMode ? null : (
                <span className="text-[var(--color-danger)]"> *</span>
              )}
            </label>
            <Input
              id="add-base-url"
              value={form.baseUrl}
              readOnly={reuseMode || !custom}
              className={classNames(
                "font-mono text-[12.5px]",
                (reuseMode || !custom) && "bg-[var(--color-surface-sunken)]",
              )}
              onChange={(event) => onPatch({ baseUrl: event.target.value })}
            />
          </div>

          {reuseMode ? null : (
            <div className="model-admin-field">
              <label
                className="workspace-admin-field-label"
                htmlFor="add-api-key"
              >
                API Key<span className="text-[var(--color-danger)]"> *</span>
              </label>
              <Input
                id="add-api-key"
                type="password"
                value={form.apiKey}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-[12.5px]"
                placeholder="sk-…"
                onChange={(event) => onPatch({ apiKey: event.target.value })}
              />
            </div>
          )}

          <div className="model-admin-field">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loadingModels || !canLoadModels}
                onClick={onLoadModels}
              >
                {loadingModels ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <List className="size-3.5" />
                )}
                获取可用模型
              </Button>
              {availableModels.length > 0 ? (
                <span className="workspace-admin-field-hint">
                  共 {availableModels.length} 个，已选 {selectedNames.length} 个
                </span>
              ) : null}
            </div>

            {availableModels.length > 0 ? (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-[var(--kimi-radius-md)] border border-[var(--color-line)]">
                {availableModels.map((model) => {
                  const exists = existingModelIds.includes(model);
                  return (
                    <Checkbox
                      key={model}
                      className={classNames(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-[12.5px]",
                        exists && "opacity-55",
                      )}
                      checked={selectedNames.includes(model)}
                      disabled={exists}
                      onChange={(event) =>
                        toggleSelectedModel(model, event.target.checked)
                      }
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">
                        {model}
                      </span>
                      {exists ? (
                        <span className="model-admin-tag">已存在</span>
                      ) : null}
                    </Checkbox>
                  );
                })}
              </div>
            ) : null}

            <span className="workspace-admin-field-hint">
              {batchMode
                ? "将按勾选的模型批量创建，模型标识与模型 ID 都取该名称"
                : "勾选多个可一次批量创建；不勾选则按下方「模型标识」单个创建"}
            </span>
          </div>

          {batchMode ? null : (
            <>
              <div className="model-admin-field">
                <label
                  className="workspace-admin-field-label"
                  htmlFor="add-model-name"
                >
                  模型标识（上游 model）
                  <span className="text-[var(--color-danger)]"> *</span>
                </label>
                <Input
                  id="add-model-name"
                  value={form.modelName}
                  className="font-mono text-[12.5px]"
                  placeholder="与厂商文档逐字一致"
                  onChange={(event) => {
                    const modelName = event.target.value;
                    onPatch({
                      modelName,
                      modelId: form.modelId || modelName,
                    });
                  }}
                />
              </div>

              <div className="model-admin-field">
                <label
                  className="workspace-admin-field-label"
                  htmlFor="add-model-id"
                >
                  模型 ID<span className="text-[var(--color-danger)]"> *</span>
                </label>
                <Input
                  id="add-model-id"
                  value={form.modelId}
                  className="font-mono text-[12.5px]"
                  placeholder="业务主键，对话可引用"
                  aria-describedby="add-model-id-hint"
                  onChange={(event) => onPatch({ modelId: event.target.value })}
                />
                <span
                  className="workspace-admin-field-hint"
                  id="add-model-id-hint"
                >
                  留空则自动跟随模型标识
                </span>
              </div>
            </>
          )}

          <div>
            <Checkbox
              checked={form.isFallback}
              onChange={(event) => onPatch({ isFallback: event.target.checked })}
            >
              备用模型
            </Checkbox>
            <div className="workspace-admin-field-hint mt-1 pl-6">
              主模型失败后按配置顺序尝试
            </div>
          </div>

          <div className="model-admin-field">
            <span className="workspace-admin-field-label">上游支持的推理强度</span>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {["low", "medium", "high", "max", "ultra"].map((level) => (
                <Checkbox
                  key={level}
                  checked={form.supportedReasoningEfforts.includes(level)}
                  onChange={(event) => onPatch({
                    supportedReasoningEfforts: ["low", "medium", "high", "max", "ultra"].filter((item) =>
                      event.target.checked
                        ? form.supportedReasoningEfforts.includes(item) || item === level
                        : form.supportedReasoningEfforts.includes(item) && item !== level,
                    ),
                  })}
                >
                  <span className="capitalize">{level}</span>
                </Checkbox>
              ))}
            </div>
            <span className="workspace-admin-field-hint">仅声明已确认支持的等级；留空表示由模型使用默认值。</span>
          </div>

          <div className="model-admin-field">
            <label
              className="workspace-admin-field-label"
              htmlFor="add-completions-path"
            >
              Completions 路径
            </label>
            <Input
              id="add-completions-path"
              value={form.completionsPath}
              className="font-mono text-[12.5px]"
              onChange={(event) =>
                onPatch({ completionsPath: event.target.value })
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            className="workspace-admin-primary"
            disabled={saving}
            onClick={onSubmit}
          >
            {saving
              ? "提交中…"
              : batchMode
                ? `创建 ${selectedNames.length} 个模型`
                : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
