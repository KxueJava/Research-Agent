export type ConversationModelConfig = {
  model: string;
  modelLabel: string;
  thinking?: boolean;
  thinkingEffort?: string;
};

export type ModelConfigChange = {
  afterRequestId: string;
  from?: ConversationModelConfig;
  /** Used to cancel a draft switch in older sessions whose run config is unknown. */
  previousSelection?: ConversationModelConfig;
  to: ConversationModelConfig;
};

export type ConversationModelState = {
  selected?: ConversationModelConfig;
  submitted?: ConversationModelConfig;
  pending?: ModelConfigChange;
  history: ModelConfigChange[];
};

const key = (sessionId: string) => `research:conversation-model:${sessionId}`;

export function readConversationModelState(sessionId: string): ConversationModelState {
  try {
    const value = JSON.parse(localStorage.getItem(key(sessionId)) || "null");
    if (value && Array.isArray(value.history)) return value;
  } catch { /* Storage is optional; keep the in-memory selection. */ }
  return { history: [] };
}

export function storeConversationModelState(sessionId: string, state: ConversationModelState) {
  try { localStorage.setItem(key(sessionId), JSON.stringify(state)); } catch { /* Storage is optional. */ }
}

export function sameModelConfig(a?: ConversationModelConfig, b?: ConversationModelConfig) {
  return a?.model === b?.model && a?.thinking === b?.thinking && a?.thinkingEffort === b?.thinkingEffort;
}

export function selectConversationModel(state: ConversationModelState, selected: ConversationModelConfig, afterRequestId?: string): ConversationModelState {
  const baseline = state.submitted || state.pending?.previousSelection || state.selected;
  return {
    ...state,
    selected,
    pending: afterRequestId && baseline && !sameModelConfig(baseline, selected)
      ? { afterRequestId, from: state.submitted, previousSelection: state.submitted ? undefined : baseline, to: selected }
      : undefined,
  };
}

export function submitConversationModel(state: ConversationModelState, submitted: ConversationModelConfig): ConversationModelState {
  // A blocked send never reaches this transition. Injection never calls it.
  const pending = state.pending;
  return {
    selected: submitted,
    submitted,
    pending: undefined,
    history: pending && !sameModelConfig(pending.from, submitted)
      ? [...state.history, { ...pending, to: submitted }]
      : state.history,
  };
}

export function describeModelChange(change: ModelConfigChange) {
  const messages: string[] = [];
  const { from, to } = change;
  if (!from || from.model !== to.model) {
    messages.push(from
      ? `模型已从 ${from.modelLabel || from.model || "默认模型"} 更改为 ${to.modelLabel || to.model || "默认模型"}。`
      : `模型已选择 ${to.modelLabel || to.model || "默认模型"}。`);
  }
  const effort = (config: ConversationModelConfig) => config.thinking === false ? "关闭" : config.thinkingEffort || "模型默认";
  if (!from || effort(from) !== effort(to)) {
    messages.push(from ? `推理强度已从 ${effort(from)} 更改为 ${effort(to)}。` : `推理强度已选择 ${effort(to)}。`);
  }
  return messages.join(" ");
}
