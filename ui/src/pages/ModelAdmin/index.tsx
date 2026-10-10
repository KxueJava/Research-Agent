import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Cpu, Plus, RefreshCw, Search } from "lucide-react";
import { Modal } from "antd";

import WorkspaceAdminHeader from "@/components/WorkspaceAdminHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  llmModelAdminApi,
  type LlmApiRecord,
  type LlmModelRecord,
  type LlmModelUpsertPayload,
} from "@/services/llmModelAdmin";
import { showMessage } from "@/utils";

import AddModelDialog from "./AddModelDialog";
import ConnectionPanel from "./ConnectionPanel";
import ModelCard from "./ModelCard";
import {
  ALL_PROVIDERS,
  emptyEditor,
  filterModels,
  modelKey,
  providerTabs,
  toEditor,
  toPayload,
  type EditorState,
  type ModelRuntime,
  type TestResult,
} from "./model";
import {
  matchProviderId,
  providerDisplayName,
  providerMark,
  providerPreset,
  PROVIDER_PRESETS,
} from "./meta";

import "@/styles/model-admin.css";

type ModelAdminProps = {
  /** 嵌在 Home 主布局内时隐藏返回/工作台切换，只保留标题与操作 */
  embedded?: boolean;
};

const ModelAdmin: ResearchType.FC<ModelAdminProps> = ({ embedded }) => {
  const [models, setModels] = useState<LlmModelRecord[]>([]);
  const [apis, setApis] = useState<LlmApiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [runtime, setRuntime] = useState<Record<number, ModelRuntime>>({});
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState(ALL_PROVIDERS);
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(
    () => new Set(),
  );
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<EditorState>(() => emptyEditor());
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  const apiMap = useMemo(() => {
    const map = new Map<string, LlmApiRecord>();
    apis.forEach((api) => map.set(api.apiId, api));
    return map;
  }, [apis]);

  const tabs = useMemo(
    () => providerTabs(models, apiMap, PROVIDER_PRESETS),
    [models, apiMap],
  );

  const visibleGroups = useMemo(() => {
    const groups = new Map<
      string,
      { apiId: string; baseUrl: string; models: LlmModelRecord[] }
    >();
    for (const model of filterModels(models, apiMap, providerFilter, query)) {
      const baseUrl = apiMap.get(model.apiId)?.baseUrl ?? "";
      const key = model.apiId || (baseUrl ? `url:${baseUrl}` : `model:${model.id}`);
      const group = groups.get(key);
      if (group) group.models.push(model);
      else groups.set(key, { apiId: model.apiId, baseUrl, models: [model] });
    }
    return Array.from(groups.entries());
  },
    [models, apiMap, providerFilter, query],
  );

  const applyEditor = useCallback(
    (model: LlmModelRecord | undefined, apiList: LlmApiRecord[]) => {
      const api = model
        ? apiList.find((item) => item.apiId === model.apiId)
        : undefined;
      setEditor(model ? toEditor(model, api) : null);
      setDirty(false);
      setKeyVisible(false);
      setTestResult(null);
    },
    [],
  );

  const refresh = useCallback(
    async (keepId?: string, preferredModelId?: string) => {
      setLoading(true);
      try {
        const [modelList, apiList] = await Promise.all([
          llmModelAdminApi.listModels(),
          llmModelAdminApi.listApis(),
        ]);
        const nextModels = Array.isArray(modelList) ? modelList : [];
        const nextApis = Array.isArray(apiList) ? apiList : [];
        setModels(nextModels);
        setApis(nextApis);

        const preferred = preferredModelId
          ? nextModels.find((model) => model.modelId === preferredModelId)
          : undefined;
        let prefer = "";
        if (keepId && nextModels.some((model) => modelKey(model) === keepId)) {
          prefer = keepId;
        } else if (preferred) {
          prefer = modelKey(preferred);
        } else if (
          selectedId &&
          nextModels.some((model) => modelKey(model) === selectedId)
        ) {
          prefer = selectedId;
        } else if (nextModels[0]) {
          prefer = modelKey(nextModels[0]);
        }

        setSelectedId(prefer);
        const hit = nextModels.find((model) => modelKey(model) === prefer);
        applyEditor(hit, nextApis);
      } catch (error) {
        showMessage()?.error(
          error instanceof Error ? error.message : "加载模型列表失败",
        );
      } finally {
        setLoading(false);
      }
    },
    [applyEditor, selectedId],
  );

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅首屏加载
  }, []);

  const select = (id: string) => {
    setSelectedId(id);
    applyEditor(
      models.find((model) => modelKey(model) === id),
      apis,
    );
  };

  const patchEditor = (patch: Partial<EditorState>) => {
    setEditor((prev) => (prev ? {
      ...prev,
      ...patch
    } : prev));
    setDirty(true);
  };

  const applyProvider = (providerId: string) => {
    const preset = providerPreset(providerId);
    setEditor((prev) =>
      prev
        ? {
          ...prev,
          providerId: preset.id,
          baseUrl: preset.baseUrl || prev.baseUrl || "",
          completionsPath: preset.completionsPath,
        }
        : prev,
    );
    setDirty(true);
  };

  const applyAddProvider = (providerId: string) => {
    const preset = providerPreset(providerId);
    setAddForm((prev) => ({
      ...prev,
      providerId: preset.id,
      baseUrl: preset.baseUrl || prev.baseUrl || "",
      completionsPath: preset.completionsPath,
    }));
  };

  /**
   * 测连接。传 draft 时用页面当前值（含尚未保存的 key）走 /test-draft；
   * 不传则按 id 测库里已保存的配置（卡片上的快捷测试）。
   */
  const runTest = async (id: number, draft?: EditorState) => {
    setBusyId(id);
    setTesting(true);
    if (id === Number(selectedId)) setTestResult(null);
    try {
      const result = draft
        ? await llmModelAdminApi.testDraftConnection({
          id: draft.id,
          modelName: draft.modelName,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
          completionsPath: draft.completionsPath,
        })
        : await llmModelAdminApi.testConnectionById(id);
      setRuntime((prev) => ({
        ...prev,
        [id]: {
          ms: result.ok ? result.ms : undefined,
          testedAt: Date.now()
        },
      }));
      if (id === Number(selectedId)) setTestResult(result);
      if (!result.ok) showMessage()?.warning(result.message || "连接失败");
    } catch (error) {
      const failure: TestResult = {
        ok: false,
        ms: 0,
        message: error instanceof Error ? error.message : "测试失败",
      };
      setRuntime((prev) => ({
        ...prev,
        [id]: { testedAt: Date.now() }
      }));
      if (id === Number(selectedId)) setTestResult(failure);
      showMessage()?.error(failure.message ?? "测试失败");
    } finally {
      setBusyId(null);
      setTesting(false);
    }
  };

  const onSave = async () => {
    if (!editor) return;
    if (!editor.modelId.trim() || !editor.modelName.trim()) {
      showMessage()?.error("模型 ID 与上游模型名必填");
      return;
    }
    if (!editor.baseUrl.trim()) {
      showMessage()?.error("Base URL 必填");
      return;
    }
    setSaving(true);
    try {
      await llmModelAdminApi.upsertBinding(toPayload(editor), {
        isNew: false,
        existingApiKey: editor.existingApiKey,
      });
      showMessage()?.success("模型已保存，下一轮对话生效");
      await refresh(editor.id == null ? undefined : String(editor.id));
    } catch (error) {
      showMessage()?.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onAdd = async () => {
    // apiId 有值 = 复用已存供应商，凭据不参与写入，也不要求重新输入 key
    const reuseProvider = Boolean(addForm.apiId);
    // 批量模式：勾选且尚未登记的模型名，每条都会建一条模型行
    const batchNames = (addForm.selectedModelNames ?? []).filter(
      (name) => !models.some((model) => model.modelId === name),
    );

    if (!batchNames.length && (!addForm.modelId.trim() || !addForm.modelName.trim())) {
      showMessage()?.error("模型 ID 与上游模型名必填");
      return;
    }
    if (!reuseProvider && (!addForm.baseUrl.trim() || !addForm.apiKey.trim())) {
      showMessage()?.error("Base URL 与 API Key 必填");
      return;
    }

    const payloads: LlmModelUpsertPayload[] = batchNames.length
      ? batchNames.map((name) => ({
        ...toPayload(addForm),
        modelId: name,
        modelName: name,
      }))
      : [toPayload(addForm)];

    setSaving(true);
    let apiId = reuseProvider ? addForm.apiId : undefined;
    const createdModelIds: string[] = [];
    try {
      // 批量时第一条负责建凭据行（新建模式），其余复用它的 apiId，
      // 因此同一个供应商只会写入一条 Base URL / API Key。
      for (const payload of payloads) {
        const result = await llmModelAdminApi.upsertBinding(
          {
            ...payload,
            apiId
          },
          {
            isNew: true,
            reuseProvider: Boolean(apiId),
            existingApiKey: addForm.apiKey,
          },
        );
        apiId = result.apiId;
        createdModelIds.push(result.modelId);
      }
      showMessage()?.success(
        createdModelIds.length > 1
          ? `已新增 ${createdModelIds.length} 个模型`
          : reuseProvider
            ? "已在该供应商下新增模型"
            : "已新增模型，可直接在对话中选用",
      );
      setAddOpen(false);
      setAddForm(emptyEditor());
      setAvailableModels([]);
      await refresh(undefined, createdModelIds[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "新增失败";
      // 批量中途失败时已写入的部分不回滚，如实告知并刷新列表
      if (createdModelIds.length) {
        showMessage()?.error(
          `已创建 ${createdModelIds.length} 个，后续失败：${message}`,
        );
        setAddOpen(false);
        setAddForm(emptyEditor());
        setAvailableModels([]);
        await refresh(undefined, createdModelIds[0]);
      } else {
        showMessage()?.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (model: LlmModelRecord) => {
    Modal.confirm({
      title: "删除模型",
      content: `确认删除「${model.modelId}」配置 #${model.id}？若无其它模型共用其 API，将一并删除凭据配置。`,
      okText: "删除",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const apiId = model.apiId;
          await llmModelAdminApi.deleteModel(model.id);
          if (apiId) {
            const stillUsed = models.some(
              (item) => item.apiId === apiId && item.id !== model.id,
            );
            if (!stillUsed) {
              await llmModelAdminApi.deleteApi(apiId).catch(() => undefined);
            }
          }
          showMessage()?.success("已删除");
          await refresh();
        } catch (error) {
          showMessage()?.error(
            error instanceof Error ? error.message : "删除失败",
          );
        }
      },
    });
  };

  const openAdd = () => {
    setAddForm(emptyEditor());
    setAvailableModels([]);
    setAddOpen(true);
  };

  const loadAvailableModels = async () => {
    // 复用模式只传 apiId：明文 key 由后端按 apiId 取，不必回到浏览器
    const reuseProvider = Boolean(addForm.apiId);
    if (!reuseProvider && (!addForm.baseUrl.trim() || !addForm.apiKey.trim())) {
      showMessage()?.error("请先填写 Base URL 与 API Key");
      return;
    }
    setLoadingModels(true);
    try {
      const result = await llmModelAdminApi.listAvailableModels(
        reuseProvider
          ? { apiId: addForm.apiId }
          : {
            baseUrl: addForm.baseUrl,
            apiKey: addForm.apiKey
          },
      );
      const list = Array.isArray(result) ? result : [];
      setAvailableModels(list);
      if (list.length === 0) showMessage()?.warning("上游未返回可用模型");
      else showMessage()?.success(`已获取 ${list.length} 个可用模型`);
    } catch {
      // request 拦截器已经展示了后端/网络错误，避免同一错误弹出两次。
    } finally {
      setLoadingModels(false);
    }
  };

  const provider = providerPreset(editor?.providerId);

  return (
    <div className="workspace-admin-shell">
      <WorkspaceAdminHeader
        title="模型配置"
        description={`接入用于 Agent 推理的大语言模型，支持 OpenAI 兼容 Chat Completions。已接入 ${models.length} 个配置。`}
        icon={Cpu}
        embedded={embedded}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void refresh()}
              title="刷新列表"
              aria-label="刷新模型列表"
            >
              <RefreshCw className="size-4" />
            </Button>

            <Button
              type="button"
              className="workspace-admin-primary"
              onClick={openAdd}
            >
              <Plus className="size-[15px]" />
              新增模型
            </Button>
          </>
        }
      />

      <div className="workspace-admin-body">
        <div className="workspace-admin-body-inner model-admin-body-inner">
          <div className="model-admin-workbench">
            <aside className="model-admin-rail">
              <div className="model-admin-search">
                <Search className="size-[15px]" aria-hidden="true" />
                <Input
                  type="search"
                  value={query}
                  placeholder="搜索模型名 / Base URL"
                  aria-label="搜索模型"
                  autoComplete="off"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              {/* 服务商筛选放在列表上方：Header 已被工作台切换器占满，
                  且筛选器紧邻它筛选的列表更易理解 */}
              <div
                className="workspace-admin-tabs model-admin-provider-tabs"
                role="group"
                aria-label="按服务商筛选"
              >
                <button
                  type="button"
                  className="workspace-admin-tab"
                  data-active={providerFilter === ALL_PROVIDERS}
                  aria-pressed={providerFilter === ALL_PROVIDERS}
                  onClick={() => setProviderFilter(ALL_PROVIDERS)}
                >
                  全部
                </button>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className="workspace-admin-tab"
                    data-active={providerFilter === tab.id}
                    aria-pressed={providerFilter === tab.id}
                    onClick={() => setProviderFilter(tab.id)}
                  >
                    <span
                      className="model-admin-mark"
                      data-size="sm"
                      style={{ background: tab.color }}
                      aria-hidden="true"
                    >
                      {tab.letter}
                    </span>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="model-admin-list">
                {loading && models.length === 0 ? (
                  <div className="model-admin-empty">加载中…</div>
                ) : null}

                {!loading && visibleGroups.length === 0 ? (
                  <div className="model-admin-empty">
                    <strong>
                      {models.length === 0
                        ? "还没有接入任何模型"
                        : "没有匹配的模型"}
                    </strong>
                    {models.length === 0
                      ? "点击右上角「新增模型」接入第一个。"
                      : "换个关键词或切换服务商筛选。"}
                  </div>
                ) : null}

                {visibleGroups.map(([groupKey, group]) => {
                  const baseUrl = group.baseUrl;
                  const provider = providerPreset(matchProviderId(baseUrl));
                  const mark = providerMark(baseUrl);
                  const collapsed = collapsedProviders.has(groupKey);
                  return (
                    <section className="model-admin-provider-group" key={groupKey}>
                      <button
                        type="button"
                        className="model-admin-provider-head"
                        aria-expanded={!collapsed}
                        onClick={() => setCollapsedProviders((previous) => {
                          const next = new Set(previous);
                          if (next.has(groupKey)) next.delete(groupKey);
                          else next.add(groupKey);
                          return next;
                        })}
                      >
                        <span
                          className="model-admin-mark"
                          data-size="sm"
                          style={{ background: mark.color }}
                          aria-hidden="true"
                        >
                          {mark.letter}
                        </span>
                        <span className="model-admin-provider-heading">
                          <span className="model-admin-provider-name">
                            {providerDisplayName(baseUrl)}
                          </span>
                          {baseUrl ? (
                            <span className="model-admin-provider-url" title={baseUrl}>
                              {baseUrl}
                            </span>
                          ) : null}
                        </span>
                        <span className="model-admin-provider-count">
                          {group.models.length}
                        </span>
                        <ChevronDown
                          className="model-admin-provider-chevron size-4"
                          aria-hidden="true"
                        />
                      </button>
                      {!collapsed ? (
                        <div className="model-admin-provider-models">
                          {group.models.map((model) => (
                            <ModelCard
                              key={modelKey(model)}
                              model={model}
                              baseUrl={baseUrl}
                              showBaseUrl={false}
                              provider={provider}
                              active={modelKey(model) === selectedId}
                              runtime={runtime[model.id]}
                              busy={busyId === model.id}
                              onSelect={() => select(modelKey(model))}
                              onTest={() => void runTest(model.id)}
                              onDelete={() => onDelete(model)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </aside>

            {editor ? (
              <ConnectionPanel
                editor={editor}
                provider={provider}
                dirty={dirty}
                saving={saving}
                testing={testing}
                testResult={testResult}
                keyVisible={keyVisible}
                onToggleKey={() => setKeyVisible((visible) => !visible)}
                onPatch={patchEditor}
                onApplyProvider={applyProvider}
                onTest={() => {
                  if (editor.id != null) void runTest(editor.id, editor);
                }}
                onSave={() => void onSave()}
                onRevert={() => select(selectedId)}
              />
            ) : (
              <section className="model-admin-panel">
                <div className="model-admin-panel-body">
                  <div className="model-admin-empty">
                    <strong>尚未选择模型</strong>
                    从左侧选择一个模型，或点击「新增模型」。
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <AddModelDialog
        open={addOpen}
        form={addForm}
        providers={apis}
        existingModelIds={models.map((model) => model.modelId)}
        saving={saving}
        onOpenChange={setAddOpen}
        onProviderChange={applyAddProvider}
        onPatch={(patch) => setAddForm((prev) => ({
          ...prev,
          ...patch
        }))}
        availableModels={availableModels}
        loadingModels={loadingModels}
        onLoadModels={() => void loadAvailableModels()}
        onSubmit={() => void onAdd()}
      />
    </div>
  );
};

export default ModelAdmin;
