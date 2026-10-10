import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpIcon,
  BarChart3Icon,
  BrainCircuitIcon,
  CheckIcon,
  ChevronDownIcon,
  ListTodo,
  SearchIcon,
  Type,
} from "lucide-react";

import { AI_CHAT_FLOATING_CLASS } from "@/components/ai-elements/ai-chat-surface";
import {
  PromptInput,
  PromptInputAddAttachmentsButton,
  type PromptInputAttachmentError,
  type PromptInputAttachmentItem,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { showMessage } from "@/utils";
import {
  GENERIC_TASK_PRODUCT,
  defaultProduct,
  productList,
} from "@/utils/constants";
import UploadAttachmentChip from "./UploadAttachmentChip";
import {
  isFallbackModelUsage,
  llmModelAdminApi,
  type LlmModelGroup,
} from "@/services/llmModelAdmin";
import ContextRing, { type ContextUsageView } from "./ContextRing";
import MarkdownBar from "./MarkdownBar";
import ModelPicker from "./ModelPicker";
import ThinkingToggle, { readThinkingEffort, storeThinkingEffort, type ThinkingEffort } from "./ThinkingToggle";
import { getReasoningLevels, normalizeReasoningEffort, supportsModelThinking } from "./reasoningEffort";
import { buildSubmitPayload } from "./inputMode";
import { useAttachmentUploads } from "./useAttachmentUploads";
import { readConversationModelState, type ConversationModelConfig } from "@/utils/conversationModelConfig";

type Props = {
  sessionId: string;
  placeholder: string;
  showBtn: boolean;
  showModelControls?: boolean;
  onModelConfigChange?: (config: ConversationModelConfig) => void;
  disabled: boolean;
  /** SSE 推送的上下文占用 */
  contextUsage?: ContextUsageView | null;
  /** Agent 任务进行中时，在发送按钮旁展示轻量运行指示 */
  busy?: boolean;
  /** 任务进行中点击发送区停止本轮 */
  onStop?: () => void;
  /**
   * 任务进行中注入指导（控制面，不开新 run）。
   * 提供后 busy 时仍可输入并发送，走 inject 而非 send。
   */
  onInject?: (text: string) => void | Promise<void>;
  size: string;
  product?: CHAT.Product;
  deepThink?: boolean;
  send: (p: CHAT.TInputInfo) => void;
  onSelectionChange?: (selection: { product: CHAT.Product; deepThink: boolean }) => void;
  /** 外部回填（Undo 上一轮 user query） */
  draftMessage?: string | null;
  onDraftConsumed?: () => void;
};

type InputModeKey = "think" | "research";

const DATA_AGENT_PRODUCT =
  (productList.find((item) => item.type === "dataAgent") as CHAT.Product | undefined) ?? defaultProduct;

const MODE_OPTIONS: Array<{
  key: InputModeKey;
  label: string;
  description: string;
  icon: typeof BrainCircuitIcon;
}> = [
  {
    key: "think",
    label: "ReAct",
    description: "边思考边执行工具",
    icon: BrainCircuitIcon,
  },
  {
    key: "research",
    label: "PlanExecute",
    description: "先规划，再执行任务",
    icon: SearchIcon,
  },
];

const VISIBLE_MODE_OPTIONS = MODE_OPTIONS;

/** 对话附件不按扩展名拦截；上传/登记链路对任意文件落盘。空字符串表示原生 file picker 与拖拽都接受全部类型。 */
export const ATTACHMENT_ACCEPT = "";

/** 单条 query 最大字符数（前端硬限制） */
export const MAX_QUERY_CHARS = 8000;

const getModeKey = (_productType?: string, deepThink = false): InputModeKey => {
  return deepThink ? "research" : "think";
};

const menuContentClassName =
  "research-composer-menu rounded-[18px] border border-black/[0.04] bg-white p-1 shadow-[0_12px_40px_-16px_rgba(15,23,42,0.28)]";

const menuTitleClassName =
  "px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-[#86868b]";

const menuItemClassName = (active: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-[12px] px-2 py-2 text-left transition-colors",
    active ? "bg-[#f5f5f7]" : "hover:bg-[#f5f5f7]/80"
  );

const toolBtnClassName = (active?: boolean, disabled?: boolean) =>
  cn(
    "research-composer-tool inline-flex h-8 max-w-full items-center gap-1 rounded-md px-2 text-[13px] font-medium tracking-[-0.01em] transition-colors",
    "text-[#6b6b70] hover:bg-black/[0.04] hover:text-[#1d1d1f] dark:text-[var(--chat-text)] dark:hover:bg-[var(--color-hover)] dark:hover:text-[var(--chat-text)]",
    active && "text-[#1d1d1f]",
    disabled && "cursor-not-allowed opacity-45 hover:bg-transparent hover:text-[#6b6b70]"
  );

/** 选中的模型跨刷新保持；localStorage 不可用时静默降级为不持久化 */
const SELECTED_MODEL_STORAGE_KEY = "research:selected-model";

function readStoredModel(): string {
  try {
    return window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function storeModel(modelId: string): void {
  try {
    if (modelId) {
      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, modelId);
    } else {
      window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
    }
  } catch {
    // 隐私模式等场景下 localStorage 会抛错，忽略即可
  }
}

const GeneralInput: ResearchType.FC<Props> = (props) => {
  const {
    sessionId,
    placeholder,
    showBtn,
    showModelControls = false,
    onModelConfigChange,
    disabled,
    contextUsage = null,
    busy = false,
    onStop,
    onInject,
    size,
    product,
    deepThink = false,
    send,
    onSelectionChange,
    draftMessage = null,
    onDraftConsumed,
  } = props;

  const [question, setQuestion] = useState("");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [markdownBarOpen, setMarkdownBarOpen] = useState(false);
  const [modelGroups, setModelGroups] = useState<LlmModelGroup[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => (showModelControls ? readConversationModelState(sessionId).selected?.model : undefined) ?? readStoredModel());
  const [thinking, setThinking] = useState(() => (showModelControls ? readConversationModelState(sessionId).selected?.thinking : undefined) ?? true);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>(() => (showModelControls ? readConversationModelState(sessionId).selected?.thinkingEffort as ThinkingEffort | undefined : undefined) ?? readThinkingEffort());
  const [forcePlanMode, setForcePlanMode] = useState(false);
  const tempData = useRef<{ compositing?: boolean }>({});
  const inputShellRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
    attachmentUploads,
    attachmentOrder,
    clearAttachmentUploads,
    removeAttachmentUpload,
    retryAttachmentUpload,
    addAttachmentUploads,
  } = useAttachmentUploads(sessionId);

  const currentMode = getModeKey(product?.type, deepThink);
  const isDataAgent = product?.type === "dataAgent";

  useEffect(() => {
    // 启用模型按供应商分组：供输入框做「供应商 → 模型」两级热切换；
    // 失败不阻断对话（空列表 = 用后端默认）
    void llmModelAdminApi
      .listEnabledModelGroups()
      .then((list) => {
        const seen = new Set<string>();
        const groups = (Array.isArray(list) ? list : [])
          .map((group) => ({
            ...group,
            models: (group.models ?? []).filter((model) => {
              // 与既有行为一致：备用模型不进选择器，modelId 重复只留第一个
              if (isFallbackModelUsage(model.modelUsage)) return false;
              if (seen.has(model.modelId)) return false;
              seen.add(model.modelId);
              return true;
            }),
          }))
          .filter((group) => group.models.length > 0);
        setModelGroups(groups);
        const flat = groups.flatMap((group) => group.models);
        setSelectedModel((prev) => {
          if (
            prev &&
            flat.some((m) => m.modelId === prev || m.modelName === prev)
          ) {
            return prev;
          }
          return flat[0]?.modelId || "";
        });
      })
      .catch(() => {
        setModelGroups([]);
      });
  }, []);

  const models = useMemo(
    () => modelGroups.flatMap((group) => group.models),
    [modelGroups],
  );

  useEffect(() => {
    storeModel(selectedModel);
  }, [selectedModel]);

  const visibleMode = currentMode;
  const currentModeOption =
    MODE_OPTIONS.find((item) => item.key === visibleMode) ?? MODE_OPTIONS[0];
  const CurrentModeIcon = currentModeOption.icon;

  const hasUploadingAttachment = attachmentOrder.some((id) => {
    const status = attachmentUploads[id]?.status;
    return status === "pending" || status === "uploading";
  });
  const hasFailedAttachment = attachmentOrder.some(
    (id) => attachmentUploads[id]?.status === "error"
  );
  const uploadedFiles = attachmentOrder
    .map((id) => attachmentUploads[id]?.uploadedFile)
    .filter((file): file is CHAT.TFile => Boolean(file));
  const canInject =
    Boolean(onInject) &&
    Boolean(question.trim()) &&
    !disabled &&
    busy &&
    !hasUploadingAttachment &&
    !hasFailedAttachment;
  const canSend =
    Boolean(question.trim()) &&
    !disabled &&
    !busy &&
    !hasUploadingAttachment &&
    !hasFailedAttachment;
  const canSubmit = canSend || canInject;
  const showDataAgentToggle = showBtn;
  const showPlanToggle = !showBtn && !isDataAgent && visibleMode === "research";

  const currentModelMeta = models.find(
    (m) => m.modelId === selectedModel || m.modelName === selectedModel
  );
  const supportsThinking = supportsModelThinking(
    currentModelMeta?.modelName,
    currentModelMeta?.modelId || selectedModel,
    currentModelMeta?.supportsThinking,
    currentModelMeta?.supportedReasoningEfforts,
  );
  const reasoningLevels = useMemo(() => getReasoningLevels(
    currentModelMeta?.modelName,
    currentModelMeta?.modelId || selectedModel,
    currentModelMeta?.supportedReasoningEfforts,
  ), [currentModelMeta, selectedModel]);
  const effectiveThinkingEffort = normalizeReasoningEffort(thinkingEffort, reasoningLevels);

  useEffect(() => {
    if (!currentModelMeta) return;
    onModelConfigChange?.({
      model: selectedModel,
      modelLabel: currentModelMeta.modelName,
      thinking: supportsThinking ? thinking : undefined,
      thinkingEffort: supportsThinking && thinking ? effectiveThinkingEffort || undefined : undefined,
    });
  }, [selectedModel, currentModelMeta, supportsThinking, thinking, effectiveThinkingEffort, onModelConfigChange]);

  useEffect(() => {
    if (effectiveThinkingEffort !== thinkingEffort) {
      setThinkingEffort(effectiveThinkingEffort);
      storeThinkingEffort(effectiveThinkingEffort);
    }
  }, [effectiveThinkingEffort, thinkingEffort]);

  useEffect(() => {
    const root = inputShellRef.current;
    if (!root) return;
    const el = root.querySelector("textarea");
    textareaRef.current = el as HTMLTextAreaElement | null;
  });

  useEffect(() => {
    if (!draftMessage) return;
    setQuestion(draftMessage.slice(0, MAX_QUERY_CHARS));
    onDraftConsumed?.();
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [draftMessage, onDraftConsumed]);

  const handleAttachmentError = useCallback((error: PromptInputAttachmentError) => {
    if (error.code === "accept") {
      showMessage()?.warning("不支持该文件类型");
      return;
    }
    if (error.code === "max_file_size") {
      showMessage()?.warning("文件过大，请压缩后再试");
      return;
    }
    if (error.code === "max_files") {
      showMessage()?.warning("一次添加的文件过多，部分未加入");
    }
  }, []);

  const handleAttachmentsAdded = useCallback(
    (attachments: PromptInputAttachmentItem[]) => {
      const nextAttachments = attachments.filter(
        (attachment): attachment is PromptInputAttachmentItem & { file: File } =>
          Boolean(attachment.file)
      );
      addAttachmentUploads(
        nextAttachments.map((attachment) => ({
          id: attachment.id,
          file: attachment.file,
        }))
      );
    },
    [addAttachmentUploads]
  );

  const handleSelectionChange = (nextProduct: CHAT.Product, nextDeepThink: boolean) => {
    onSelectionChange?.({
      product: nextProduct,
      deepThink: nextDeepThink,
    });
  };

  const handleModeSelect = (modeKey: InputModeKey) => {
    // 普通模式统一走 ReAct，研究模式统一走 PlanSolve。
    handleSelectionChange(GENERIC_TASK_PRODUCT, modeKey === "research");
    if (modeKey !== "research") {
      setForcePlanMode(false);
    }
    setModeMenuOpen(false);
  };

  const handleQuestionChange = (value: string) => {
    setQuestion(value.length > MAX_QUERY_CHARS ? value.slice(0, MAX_QUERY_CHARS) : value);
  };

  const handleSubmit = ({ text }: { text: string; files: unknown[] }) => {
    const trimmed = text.trim().slice(0, MAX_QUERY_CHARS);
    if (!trimmed || disabled || hasUploadingAttachment || hasFailedAttachment) return;

    if (busy && onInject) {
      void Promise.resolve(onInject(trimmed));
      setQuestion("");
      setForcePlanMode(false);
      return;
    }
    if (busy) {
      return;
    }

    send({
      ...buildSubmitPayload({
        question: trimmed,
        visibleMode,
        isDataAgent,
        uploadedFiles,
        model: selectedModel || undefined,
        thinking: supportsThinking ? thinking : undefined,
        thinkingEffort: supportsThinking && thinking ? effectiveThinkingEffort : undefined,
        forcePlanMode: showPlanToggle && forcePlanMode,
      }),
      modelLabel: currentModelMeta?.modelName || selectedModel,
    });

    setQuestion("");
    setForcePlanMode(false);
    clearAttachmentUploads();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (event.key !== "Enter") return;
    if (tempData.current.compositing || event.nativeEvent.isComposing) return;

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      if (question.length >= MAX_QUERY_CHARS) {
        return;
      }
      const textarea = event.currentTarget;
      const { selectionStart, selectionEnd } = textarea;
      const nextValue = (
        question.slice(0, selectionStart) + "\n" + question.slice(selectionEnd)
      ).slice(0, MAX_QUERY_CHARS);
      setQuestion(nextValue);
      requestAnimationFrame(() => {
        const caret = Math.min(selectionStart + 1, nextValue.length);
        textarea.selectionStart = caret;
        textarea.selectionEnd = caret;
        textarea.focus();
      });
      return;
    }

    if (!canSubmit) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <TooltipProvider>
      <div className="w-full" ref={inputShellRef}>
        <PromptInput
          accept={ATTACHMENT_ACCEPT}
          className="research-input-flat w-full"
          convertBlobUrlsOnSubmit={false}
          multiple={true}
          onAttachmentsAdded={handleAttachmentsAdded}
          onError={handleAttachmentError}
          onSubmit={handleSubmit}
        >
          <PromptInputBody>
            <PromptInputAttachments className="research-composer-attachments px-1.5 pt-2.5 pb-0">
              {(file) => (
                <UploadAttachmentChip
                  key={file.id}
                  attachment={file}
                  uploadState={attachmentUploads[file.id]}
                  onRemoveAttachment={removeAttachmentUpload}
                  onRetryAttachment={retryAttachmentUpload}
                />
              )}
            </PromptInputAttachments>

            {markdownBarOpen ? (
              <MarkdownBar
                textareaRef={textareaRef}
                value={question}
                onChange={handleQuestionChange}
                disabled={disabled}
              />
            ) : null}

            <PromptInputTextarea
              className={cn(
                "research-composer-textarea px-4 text-[15px] leading-[1.5] placeholder:text-[#9aa3af] placeholder:opacity-100",
                size === "big"
                  ? "research-composer-textarea-big min-h-[76px] pt-3.5"
                  : "research-composer-textarea-medium min-h-[54px] pt-3"
              )}
              disabled={disabled}
              maxLength={MAX_QUERY_CHARS}
              onChange={(event) => handleQuestionChange(event.target.value)}
              onCompositionEnd={() => {
                tempData.current.compositing = false;
              }}
              onCompositionStart={() => {
                tempData.current.compositing = true;
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              value={question}
            />
            {question.length >= Math.floor(MAX_QUERY_CHARS * 0.8) ? (
              <div
                className={cn(
                  "px-4 pb-1 text-right text-[11px] tabular-nums",
                  question.length >= MAX_QUERY_CHARS
                    ? "text-[#ff3b30]"
                    : "text-[#aeaeb2]"
                )}
              >
                {question.length}/{MAX_QUERY_CHARS}
              </div>
            ) : null}
          </PromptInputBody>

          <PromptInputFooter className="research-composer-footer items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
            <PromptInputTools className="research-composer-tools research-composer-tools-left min-w-0 flex-1 flex-wrap items-center gap-0.5">
              <PromptInputAddAttachmentsButton
                size="icon-sm"
                variant="ghost"
                disabled={disabled}
                className="research-composer-icon-button h-8 w-8 rounded-md border-0 bg-transparent text-[#6b6b70] shadow-none ring-0 hover:bg-black/[0.04] hover:text-[#1d1d1f] focus-visible:ring-0"
              />

              {showPlanToggle ? (
                <button
                  type="button"
                  aria-pressed={forcePlanMode}
                  disabled={disabled || busy}
                  className={cn(
                    toolBtnClassName(false, disabled || busy),
                    forcePlanMode &&
                      "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] hover:text-white"
                  )}
                  title={
                    busy
                      ? "任务进行中，指导不会进入计划模式"
                      : "本轮先规划再执行，发送后复位"
                  }
                  onClick={() => setForcePlanMode((value) => !value)}
                >
                  <ListTodo className="size-3.5 shrink-0 opacity-80" />
                  <span className="truncate">计划</span>
                </button>
              ) : null}

              {showBtn ? (
                <>
                  <DropdownMenu open={modeMenuOpen} onOpenChange={setModeMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={disabled}
                        className={toolBtnClassName(!isDataAgent, disabled)}
                      >
                        <CurrentModeIcon className="size-3.5 shrink-0 opacity-80" />
                        <span className="truncate">{currentModeOption.label}</span>
                        <ChevronDownIcon
                          className={cn(
                            "size-3.5 shrink-0 opacity-50 transition-transform",
                            modeMenuOpen && "rotate-180"
                          )}
                        />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      side="bottom"
                      sideOffset={10}
                      className={cn("w-[200px]", menuContentClassName)}
                    >
                      <div className={menuTitleClassName}>模式</div>
                      <div className="space-y-0.5">
                        {VISIBLE_MODE_OPTIONS.map((option) => {
                          const isActive = option.key === visibleMode && !isDataAgent;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              className={menuItemClassName(isActive)}
                              onClick={() => handleModeSelect(option.key)}
                            >
                              <option.icon className="size-3.5 shrink-0 text-[#6b6b70]" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[13.5px] font-medium text-[#1d1d1f]">
                                  {option.label}
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-4 text-[#86868b]">
                                  {option.description}
                                </span>
                              </span>
                              {isActive ? (
                                <CheckIcon className="size-3.5 shrink-0 text-[#1d1d1f]" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {showDataAgentToggle ? (
                    <button
                      type="button"
                      aria-pressed={isDataAgent}
                      disabled={disabled}
                      className={toolBtnClassName(isDataAgent, disabled)}
                      onClick={() => {
                        if (isDataAgent) {
                          handleSelectionChange(GENERIC_TASK_PRODUCT, false);
                          return;
                        }
                        handleSelectionChange(DATA_AGENT_PRODUCT, false);
                      }}
                    >
                      <BarChart3Icon className="size-3.5 shrink-0 opacity-80" />
                      <span className="truncate">数据分析</span>
                    </button>
                  ) : null}

                  <button
                    type="button"
                    disabled={disabled}
                    className={toolBtnClassName(markdownBarOpen, disabled)}
                    title="格式工具条（Markdown）"
                    onClick={() => setMarkdownBarOpen((v) => !v)}
                  >
                    <Type className="size-3.5 shrink-0 opacity-80" />
                  </button>

                </>
              ) : null}

              {showBtn || showModelControls ? (
                <>
                  <ModelPicker
                    groups={modelGroups}
                    value={selectedModel}
                    onChange={setSelectedModel}
                    disabled={disabled}
                    open={modelMenuOpen}
                    onOpenChange={setModelMenuOpen}
                    triggerClassName={toolBtnClassName}
                  />

                  <ThinkingToggle
                    supported={supportsThinking}
                    thinking={thinking}
                    effort={effectiveThinkingEffort}
                    levels={reasoningLevels}
                    disabled={disabled}
                    open={thinkingMenuOpen}
                    onOpenChange={setThinkingMenuOpen}
                    triggerClassName={toolBtnClassName}
                    onChange={(on, effort) => {
                      setThinking(on);
                      setThinkingEffort(effort);
                      storeThinkingEffort(effort);
                    }}
                  />
                </>
              ) : null}
            </PromptInputTools>

            <PromptInputTools className="research-composer-tools research-composer-tools-right ml-auto shrink-0 items-center gap-1.5 self-end">
              <ContextRing
                usage={contextUsage}
                contextWindow={currentModelMeta?.contextWindow}
              />
              {busy && onStop ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="research-composer-stop group relative flex size-8 items-center justify-center rounded-full border border-[var(--color-danger-bd)] bg-[var(--color-danger-soft)] p-0 text-[var(--color-danger)] shadow-[var(--shadow-xs)] transition-[background-color,border-color,color,transform] duration-150 hover:border-[var(--color-danger)] hover:bg-[var(--color-danger)] hover:text-white active:scale-[0.92]"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onStop();
                      }}
                      aria-label="停止"
                    >
                      <span className="block size-2.5 rounded-[2px] bg-current" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className={AI_CHAT_FLOATING_CLASS} side="top">
                    停止
                  </TooltipContent>
                </Tooltip>
              ) : null}
              {(!busy || onInject) ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PromptInputSubmit
                      className={cn(
                        "research-send-btn relative flex size-8 items-center justify-center rounded-full border-0 p-0 shadow-none transition-opacity",
                        "bg-[var(--color-accent)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)]",
                        "disabled:cursor-not-allowed disabled:bg-[var(--color-accent)] disabled:text-[var(--color-text-on-accent)] disabled:opacity-45"
                      )}
                      disabled={!canSubmit}
                      variant="ghost"
                    >
                      <ArrowUpIcon className="size-[15px] stroke-[2.25]" />
                    </PromptInputSubmit>
                  </TooltipTrigger>
                  <TooltipContent className={AI_CHAT_FLOATING_CLASS} side="top">
                    {busy && onInject ? "发送指导（注入当前任务）" : "发送"}
                  </TooltipContent>
                </Tooltip>
              ) : busy ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="sr-only">任务进行中</span>
                  </TooltipTrigger>
                  <TooltipContent className={AI_CHAT_FLOATING_CLASS} side="top">
                    任务进行中
                  </TooltipContent>
                </Tooltip>
              ) : null}
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </TooltipProvider>
  );
};

export default GeneralInput;
