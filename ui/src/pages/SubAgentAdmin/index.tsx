import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { Modal, Select, Switch } from "antd";

import WorkspaceAdminHeader from "@/components/WorkspaceAdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  subAgentDefinitionAdminApi,
  type SubAgentDefinitionRecord,
  type SubAgentDefinitionUpsertPayload,
} from "@/services/subAgentDefinitionAdmin";
import { showMessage } from "@/utils";
import { llmModelAdminApi, type LlmModelGroup } from "@/services/llmModelAdmin";
import { getReasoningLevels, type ThinkingEffort } from "@/components/GeneralInput/reasoningEffort";

type Draft = SubAgentDefinitionUpsertPayload & { isNew: boolean };

const EMPTY_DRAFT = (): Draft => ({
  isNew: true,
  agentKey: "",
  displayName: "",
  whenToUse: "",
  systemPrompt: "",
  allowedTools: ["*"],
  disallowedTools: [],
  maxSteps: 10,
  modelConfigId: null,
  thinkingEffort: null,
  status: 1,
});

function recordToDraft(record: SubAgentDefinitionRecord): Draft {
  // 编辑时复制数组字段，避免表单修改直接污染列表缓存中的服务端快照。
  return {
    isNew: false,
    agentKey: record.agentKey,
    displayName: record.displayName || "",
    whenToUse: record.whenToUse || "",
    systemPrompt: record.systemPrompt || "",
    allowedTools: record.allowedTools?.length
      ? [...record.allowedTools]
      : ["*"],
    disallowedTools: record.disallowedTools ? [...record.disallowedTools] : [],
    maxSteps: record.maxSteps ?? null,
    modelConfigId: record.modelConfigId ?? null,
    thinkingEffort: record.thinkingEffort ?? null,
    status: record.status ?? 1,
  };
}

type SubAgentAdminProps = {
  embedded?: boolean;
};

const SubAgentAdmin: ResearchType.FC<SubAgentAdminProps> = ({ embedded }) => {
  const [items, setItems] = useState<SubAgentDefinitionRecord[]>([]);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [modelGroups, setModelGroups] = useState<LlmModelGroup[]>([]);
  const [modelError, setModelError] = useState("");
  const [testingModel, setTestingModel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    try { return sessionStorage.getItem("research.subagent.selected-key"); }
    catch { return null; }
  });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT());

  const refresh = useCallback(async () => {
    // 列表和工具目录并行加载；目录失败可降级为通配符，不阻断定义列表展示。
    setLoading(true);
    try {
      const [list, tools, models] = await Promise.all([
        subAgentDefinitionAdminApi.queryList(),
        subAgentDefinitionAdminApi.toolCatalog().catch(() => [] as string[]),
        llmModelAdminApi.listEnabledModelGroups().then((groups) => {
          setModelError("");
          return groups;
        }).catch(() => {
          setModelError("模型列表加载失败，请刷新后重试。");
          return [] as LlmModelGroup[];
        }),
      ]);
      setModelGroups(Array.isArray(models) ? models : []);
      setItems(Array.isArray(list) ? list : []);
      setCatalog(Array.isArray(tools) && tools.length ? tools : ["*"]);
      setSelectedKey((prev) => {
        if (prev && list?.some((item) => item.agentKey === prev)) {
          return prev;
        }
        return null;
      });
    } catch (error) {
      showMessage()?.error(
        error instanceof Error ? error.message : "加载子 Agent 列表失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      if (selectedKey) sessionStorage.setItem("research.subagent.selected-key", selectedKey);
      else sessionStorage.removeItem("research.subagent.selected-key");
    } catch { /* 浏览器禁用存储时仍可正常编辑。 */ }
  }, [selectedKey]);

  useEffect(() => {
    // 列表刷新后重新把当前 key 映射到 draft，保证外部更新能反映到编辑表单。
    if (!selectedKey) {
      return;
    }
    const hit = items.find((item) => item.agentKey === selectedKey);
    if (hit) {
      setDraft(recordToDraft(hit));
    }
  }, [items, selectedKey]);

  const onNew = () => {
    setSelectedKey(null);
    setDraft(EMPTY_DRAFT());
  };

  const onSelect = (key: string) => {
    setSelectedKey(key);
    const hit = items.find((item) => item.agentKey === key);
    if (hit) {
      setDraft(recordToDraft(hit));
    }
  };

  const onSave = async () => {
    // 先校验最小可运行契约，再统一 trim 文本并把空数组转为未配置。
    if (!draft.agentKey.trim()) {
      showMessage()?.error("agentKey 不能为空");
      return;
    }
    if (!draft.whenToUse.trim() || !draft.systemPrompt.trim()) {
      showMessage()?.error("whenToUse 与 systemPrompt 必填");
      return;
    }
    if (draft.modelConfigId != null && !modelGroups.some((group) =>
      group.models.some((model) => model.id === draft.modelConfigId))) {
      showMessage()?.error("所选模型不可用，请重新选择模型或继承主 Agent");
      return;
    }
    setSaving(true);
    try {
      const payload: SubAgentDefinitionUpsertPayload = {
        agentKey: draft.agentKey.trim(),
        displayName: draft.displayName?.trim() || undefined,
        whenToUse: draft.whenToUse.trim(),
        systemPrompt: draft.systemPrompt,
        allowedTools: draft.allowedTools?.length
          ? draft.allowedTools
          : undefined,
        disallowedTools: draft.disallowedTools?.length
          ? draft.disallowedTools
          : undefined,
        maxSteps: draft.maxSteps ?? null,
        modelConfigId: draft.modelConfigId ?? null,
        thinkingEffort: draft.modelConfigId == null ? null : draft.thinkingEffort ?? null,
        status: draft.status ?? 1,
      };
      if (draft.isNew) {
        // 新建和更新共用 payload，但分别调用后端生命周期操作。
        const ok = await subAgentDefinitionAdminApi.create(payload);
        if (!ok) throw new Error("子 Agent 定义保存失败");
      } else {
        const ok = await subAgentDefinitionAdminApi.update(payload);
        if (!ok) throw new Error("子 Agent 定义保存失败");
      }
      const saved = await subAgentDefinitionAdminApi.get(payload.agentKey);
      if ((saved.modelConfigId ?? null) !== payload.modelConfigId) {
        throw new Error("模型配置未保存成功，请确认后端已更新并重启后重试");
      }
      showMessage()?.success(draft.isNew ? "已创建并热加载" : "已更新并热加载");
      await refresh();
      setSelectedKey(payload.agentKey);
    } catch (error) {
      showMessage()?.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    // 删除是软删除且会影响运行时 Registry，因此必须绑定当前已保存定义并二次确认。
    if (!selectedKey || draft.isNew) {
      return;
    }
    Modal.confirm({
      title: "删除子 Agent",
      content: `确认软删除「${selectedKey}」？主 Agent 将无法再调度该类型。`,
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await subAgentDefinitionAdminApi.remove(selectedKey);
          showMessage()?.success("已删除并热加载");
          setSelectedKey(null);
          setDraft(EMPTY_DRAFT());
          await refresh();
        } catch (error) {
          showMessage()?.error(
            error instanceof Error ? error.message : "删除失败",
          );
        }
      },
    });
  };

  const onTestModel = async () => {
    const id = draft.modelConfigId;
    if (id == null) return;
    setTestingModel(true);
    try {
      const result = await llmModelAdminApi.testConnectionById(id);
      if (result.ok) {
        showMessage()?.success(`模型连接成功，耗时 ${result.ms} ms`);
      } else {
        showMessage()?.error(result.message || "模型连接失败");
      }
    } catch (error) {
      showMessage()?.error(error instanceof Error ? error.message : "模型连接失败");
    } finally {
      setTestingModel(false);
    }
  };

  const onReload = async () => {
    // Registry 重载完成后重新拉取列表，让管理页显示运行时实际生效的定义数量。
    try {
      const count = await subAgentDefinitionAdminApi.reload();
      showMessage()?.success(`Registry 已重载，配置条数 ${count}`);
      await refresh();
    } catch (error) {
      showMessage()?.error(error instanceof Error ? error.message : "重载失败");
    }
  };

  const toolOptions = useMemo(
    () => catalog.map((name) => ({
      label: name,
      value: name
    })),
    [catalog],
  );

  return (
    <div className="workspace-admin-shell">
      <WorkspaceAdminHeader
        title="子 Agent 装配"
        description="定义可被主 Agent 调度的角色、指令与工具边界。保存后立即热加载。"
        icon={Bot}
        embedded={embedded}
      />

      <div className="workspace-admin-body">
        <div className="workspace-admin-body-inner">
          <div className="workspace-admin-workbench">
            <aside className="workspace-admin-rail">
              <div className="workspace-admin-section-head">
                <div>
                  <div className="workspace-admin-section-title">定义列表</div>
                  <div className="workspace-admin-section-meta">
                    {items.length} 个可调度角色
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => void refresh()}
                    disabled={loading}
                    aria-label="刷新子 Agent 列表"
                    title="刷新列表"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onNew}
                    aria-label="新建子 Agent"
                    title="新建子 Agent"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="workspace-admin-list">
                {items.length === 0 && !loading ? (
                  <div className="workspace-admin-empty">
                    暂无自定义子 Agent
                  </div>
                ) : null}
                {items.map((item) => (
                  <button
                    key={item.agentKey}
                    type="button"
                    onClick={() => onSelect(item.agentKey)}
                    data-active={selectedKey === item.agentKey}
                    className="workspace-admin-list-item"
                  >
                    <span className="workspace-admin-list-item-title">
                      {item.displayName || item.agentKey}
                    </span>
                    <span className="workspace-admin-list-item-meta">
                      <span className="workspace-admin-list-item-code">
                        {item.agentKey}
                      </span>
                      <span
                        className="workspace-admin-status"
                        data-disabled={item.status === 0}
                      >
                        <span
                          className="workspace-admin-status-dot"
                          aria-hidden="true"
                        />
                        {item.status === 0 ? "禁用" : "启用"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="workspace-admin-footer">
                <Button
                  type="button"
                  variant="outline"
                  className="workspace-admin-secondary w-full"
                  onClick={() => void onReload()}
                >
                  重载 Registry
                </Button>
              </div>
            </aside>

            <section className="workspace-admin-panel">
              <div className="workspace-admin-panel-head">
                <div>
                  <div className="workspace-admin-panel-title">
                    {draft.isNew ? "新建子 Agent" : `编辑 · ${draft.agentKey}`}
                  </div>
                  <div className="workspace-admin-panel-subtitle">
                    角色定义会影响主 Agent 的调度描述与工具权限。
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!draft.isNew ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="workspace-admin-danger"
                      onClick={onDelete}
                      disabled={saving}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="workspace-admin-primary"
                    onClick={() => void onSave()}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    保存定义
                  </Button>
                </div>
              </div>

              <div className="workspace-admin-panel-body">
                <div className="workspace-admin-form-section">
                  <div className="workspace-admin-form-section-title">
                    角色身份
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="workspace-admin-field-label">
                        agentKey（subagent_type）
                      </span>
                      <Input
                        value={draft.agentKey}
                        disabled={!draft.isNew || saving}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            agentKey: e.target.value
                          }))
                        }
                        placeholder="如 code-reviewer"
                        className="font-mono"
                      />
                    </label>
                    <label>
                      <span className="workspace-admin-field-label">
                        展示名
                      </span>
                      <Input
                        value={draft.displayName || ""}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            displayName: e.target.value,
                          }))
                        }
                        placeholder="代码审查"
                      />
                    </label>
                  </div>
                </div>

                <div className="workspace-admin-form-section">
                  <div className="workspace-admin-form-section-title">
                    调度指令
                  </div>
                  <div className="grid gap-4">
                    <label>
                      <span className="workspace-admin-field-label">
                        whenToUse（主 Agent 何时调用）
                      </span>
                      <Input
                        value={draft.whenToUse}
                        disabled={saving}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            whenToUse: e.target.value
                          }))
                        }
                        placeholder="只读代码审查、安全与可维护性建议"
                      />
                    </label>
                    <label>
                      <span className="workspace-admin-field-label">
                        systemPrompt
                      </span>
                      <Textarea
                        value={draft.systemPrompt}
                        disabled={saving}
                        rows={10}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            systemPrompt: e.target.value,
                          }))
                        }
                        placeholder="子 Agent 系统提示词"
                        className="font-mono text-[12px]"
                      />
                    </label>
                  </div>
                </div>

                <div className="workspace-admin-form-section">
                  <div className="workspace-admin-form-section-title">
                    模型配置
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="subagent-model" className="workspace-admin-field-label">
                        子 Agent 模型
                      </label>
                      <Select
                        id="subagent-model"
                        className="workspace-admin-multi-select w-full"
                        disabled={saving || testingModel}
                        showSearch
                        optionFilterProp="label"
                        value={draft.modelConfigId ?? "inherit"}
                        onChange={(value) => setDraft((d) => ({
                          ...d,
                          modelConfigId: value === "inherit" ? null : Number(value),
                          thinkingEffort: null,
                        }))}
                        options={[
                          { label: "继承主 Agent 模型", value: "inherit" },
                          ...modelGroups.map((group) => ({
                            label: group.apiId,
                            options: group.models.map((model) => ({
                              label: `${group.apiId} / ${model.modelName}`,
                              value: model.id,
                            })),
                          })),
                          ...(draft.modelConfigId != null && !modelGroups.some((group) =>
                            group.models.some((model) => model.id === draft.modelConfigId))
                            ? [{ label: `模型配置 #${draft.modelConfigId}（不可用）`, value: draft.modelConfigId, disabled: true }]
                            : []),
                        ]}
                        status={modelError || (draft.modelConfigId != null && !modelGroups.some((group) =>
                          group.models.some((model) => model.id === draft.modelConfigId))) ? "error" : undefined}
                      />
                      <span className="workspace-admin-field-hint mt-1">
                        选择后请点击“保存定义”，刷新后才会保留。
                      </span>
                      {modelError ? <span role="alert" className="workspace-admin-field-hint mt-1">{modelError}</span> : null}
                      {!modelError && draft.modelConfigId != null && !modelGroups.some((group) =>
                        group.models.some((model) => model.id === draft.modelConfigId)) ? (
                        <span role="alert" className="workspace-admin-field-hint mt-1">
                          所选模型已禁用或删除，请重新选择。
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center self-start sm:pt-7">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={saving || testingModel || draft.modelConfigId == null || !modelGroups.some((group) =>
                          group.models.some((model) => model.id === draft.modelConfigId))}
                        onClick={() => void onTestModel()}
                      >
                        {testingModel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        测试模型连接
                      </Button>
                    </div>
                  </div>
                  {(() => {
                    const selectedModel = modelGroups
                      .flatMap((group) => group.models)
                      .find((model) => model.id === draft.modelConfigId);
                    const inherited = draft.modelConfigId == null;
                    const modelLevels = getReasoningLevels(selectedModel?.modelName, selectedModel?.modelId);
                    const configuredLevels = (selectedModel?.supportedReasoningEfforts ?? [])
                      .filter((level) => (modelLevels as readonly string[]).includes(level));
                    const levels = configuredLevels.length > 0
                      ? configuredLevels
                      : modelLevels;
                    const supportsThinking = levels.length > 0;
                    const effort = draft.thinkingEffort;
                    const normalizedEffort = effort && (levels as readonly string[]).includes(effort)
                      ? effort
                      : inherited ? null : "model-default";
                    const sliderIndex = normalizedEffort && normalizedEffort !== "model-default"
                      ? (levels as readonly string[]).indexOf(normalizedEffort)
                      : -1;
                    return (
                      <div className="mt-4 max-w-[590px]">
                        <div className="mb-2 flex items-center justify-between">
                          <label htmlFor="subagent-thinking-effort" className="workspace-admin-field-label mb-0">推理强度</label>
                          <span className="rounded-md border border-[var(--color-accent-bd)] bg-[var(--color-accent-soft)] px-2 py-1 text-xs font-semibold capitalize text-[var(--color-accent)]">
                            {inherited ? "继承主 Agent" : normalizedEffort === "model-default" ? "模型默认" : normalizedEffort}
                          </span>
                        </div>
                        {inherited ? (
                          <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
                            推理强度跟随主 Agent 的模型与当前设置。
                          </div>
                        ) : (
                          <>
                            <div className={`subagent-reasoning-track${normalizedEffort === "ultra" ? " reasoning-ultra" : ""}`}>
                              <div className="subagent-reasoning-fill" style={{ width: `${sliderIndex < 0 ? 0 : sliderIndex / Math.max(levels.length - 1, 1) * 100}%` }} />
                              <div className="subagent-reasoning-stops" aria-hidden="true">
                                {levels.map((level, index) => <i key={level} className={index <= sliderIndex ? "active" : ""} />)}
                              </div>
                              <input
                                id="subagent-thinking-effort"
                                type="range"
                                min={0}
                                max={levels.length - 1}
                                step={1}
                                value={Math.max(0, sliderIndex)}
                                disabled={saving || !supportsThinking}
                                aria-label="子 Agent 推理强度"
                                aria-valuetext={normalizedEffort === "model-default" ? "模型默认" : normalizedEffort ?? undefined}
                                onChange={(event) => setDraft((current) => ({
                                  ...current,
                                  thinkingEffort: levels[Number(event.target.value)] as ThinkingEffort,
                                }))}
                              />
                            </div>
                            <div className="mt-1 flex justify-between text-[11px] capitalize text-[var(--color-text-muted)]">
                              {levels.map((level) => <span key={level}>{level}</span>)}
                            </div>
                          </>
                        )}
                        {!inherited ? (
                          <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-2.5 py-2 text-xs text-[var(--color-text-muted)]">
                            <span className="subagent-reasoning-check" aria-hidden="true">✓</span>
                            <span>{selectedModel?.modelName} 的可选档位；选择“模型默认”时不向服务发送推理强度。</span>
                          </div>
                        ) : null}
                        {!inherited && normalizedEffort !== "model-default" ? (
                          <button type="button" className="mt-2 text-xs text-[var(--color-text-muted)] underline underline-offset-2" disabled={saving} onClick={() => setDraft((current) => ({ ...current, thinkingEffort: null }))}>使用模型默认</button>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>

                <div className="workspace-admin-form-section">
                  <div className="workspace-admin-form-section-title">
                    工具边界
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="workspace-admin-field-label">
                        允许工具（* 表示全部）
                      </span>
                      <Select
                        mode="multiple"
                        className="workspace-admin-multi-select w-full"
                        disabled={saving}
                        options={toolOptions}
                        value={draft.allowedTools || []}
                        onChange={(value) =>
                          setDraft((d) => ({
                            ...d,
                            allowedTools: value as string[],
                          }))
                        }
                        placeholder="选择工具"
                      />
                    </label>
                    <label>
                      <span className="workspace-admin-field-label">
                        禁止工具
                      </span>
                      <Select
                        mode="multiple"
                        className="workspace-admin-multi-select w-full"
                        disabled={saving}
                        options={toolOptions.filter((o) => o.value !== "*")}
                        value={draft.disallowedTools || []}
                        onChange={(value) =>
                          setDraft((d) => ({
                            ...d,
                            disallowedTools: value as string[],
                          }))
                        }
                        placeholder="可选"
                      />
                    </label>
                  </div>
                </div>

                <div className="workspace-admin-form-section">
                  <div className="workspace-admin-form-section-title">
                    执行边界
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className="workspace-admin-field-label">
                        maxSteps
                      </span>
                      <Input
                        type="number"
                        value={draft.maxSteps ?? ""}
                        disabled={saving}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setDraft((d) => ({
                            ...d,
                            maxSteps: raw === "" ? null : Number(raw),
                          }));
                        }}
                        placeholder="默认沿用 React 配置"
                      />
                    </label>
                    <label className="flex items-center gap-3 self-end pb-2">
                      <Switch
                        checked={(draft.status ?? 1) === 1}
                        disabled={saving}
                        onChange={(checked) =>
                          setDraft((d) => ({
                            ...d,
                            status: checked ? 1 : 0
                          }))
                        }
                      />
                      <span>
                        <span className="workspace-admin-field-label mb-0">
                          启用此定义
                        </span>
                        <span className="workspace-admin-field-hint mt-1">
                          禁用后主 Agent 不会再调度它。
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubAgentAdmin;
