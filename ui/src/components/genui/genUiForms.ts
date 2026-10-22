import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useGenUiRenderContext } from "./GenUiRenderContext";
import { belongsToGenUiSession, genUiLocalScopeKey, getNodeUiState,hasNodeUiState, setNodeUiState, subscribeGenUiLocalTree, getGenUiLocalSnapshot } from "./genUiLocalTreeStore";

type FormValuesMap = Record<string, Record<string, unknown>>;

let values: FormValuesMap = {};
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return values;
}

export const genUiFormsStore = {
  clearSession(sessionId:string){
    values=Object.fromEntries(Object.entries(values).filter(([key])=>!belongsToGenUiSession(key,sessionId)));emit();
  },
  setField(formKey: string, name: string, value: unknown) {
    values = {
      ...values,
      [formKey]: { ...(values[formKey] ?? {}), [name]: value },
    };
    emit();
  },
  seedField(formKey: string, name: string, value: unknown) {
    const current = values[formKey];
    if (current && name in current) return;
    if (value === undefined) return;
    values = {
      ...values,
      [formKey]: { ...(values[formKey] ?? {}), [name]: value },
    };
    emit();
  },
  getValues(formKey: string): Record<string, unknown> {
    return values[formKey] ?? {};
  },
  clearForm(formKey: string) {
    if (!(formKey in values)) return;
    const next = { ...values };
    delete next[formKey];
    values = next;
    emit();
  },
};

export type GenUiFormScope = {
  formKey: string;
  formId: string;
};

const GenUiFormContext = createContext<GenUiFormScope | null>(null);

export function useGenUiFormScope(): GenUiFormScope | null {
  return useContext(GenUiFormContext);
}

export function formExtrasAtClick(scope: GenUiFormScope | null): {
  formValues?: Record<string, unknown>;
  formId?: string;
} {
  if (!scope) return {};
  return {
    formValues: genUiFormsStore.getValues(scope.formKey),
    formId: scope.formId,
  };
}

export function GenUiFormProvider({
  formId,
  formKey,
  children,
}: {
  formId: string;
  formKey: string;
  children: ReactNode;
}) {
  const scope = useMemo(() => ({ formId, formKey }), [formId, formKey]);
  return createElement(GenUiFormContext.Provider, { value: scope }, children);
}

export function useGenUiFormField(
  name: string,
  initialValue: unknown
): {
  interactive: boolean;
  value: unknown;
  onChange: (v: unknown) => void;
} {
  const scope = useGenUiFormScope();
  const context=useGenUiRenderContext();
  const nodeScoped=Boolean(context.sessionId&&context.surfaceId&&context.nodeId);
  const nodeScope=genUiLocalScopeKey(context.sessionId,context.messageId,context.surfaceId);
  useSyncExternalStore(subscribeGenUiLocalTree,getGenUiLocalSnapshot,getGenUiLocalSnapshot);
  const interactive = Boolean(scope && name)||nodeScoped;
  const formKey = scope?.formKey ?? "";
  const store = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (scope && name && initialValue !== undefined) {
      genUiFormsStore.seedField(formKey, name, initialValue);
    }
  }, [scope, formKey, name, initialValue]);
  useEffect(()=>{
    if(nodeScoped&&getNodeUiState(nodeScope,context.nodeId!)===undefined&&initialValue!==undefined)setNodeUiState(nodeScope,context.nodeId!,initialValue);
  },[nodeScoped,nodeScope,context.nodeId,initialValue]);

  const stored = interactive ? store[formKey]?.[name] : undefined;
  const nodeValue=nodeScoped?getNodeUiState(nodeScope,context.nodeId!):undefined;
  const nodePresent=nodeScoped&&hasNodeUiState(nodeScope,context.nodeId!);
  const value = nodePresent?(nodeValue===undefined?initialValue:nodeValue):stored!==undefined?stored:initialValue;
  useEffect(()=>{
    if(nodePresent&&scope&&name)genUiFormsStore.setField(formKey,name,nodeValue===undefined?initialValue:nodeValue);
  },[nodePresent,nodeValue,initialValue,formKey,name,scope]);

  return {
    interactive,
    value,
    onChange: (v: unknown) => {
      if(nodeScoped)setNodeUiState(nodeScope,context.nodeId!,v);
      if (scope&&name) genUiFormsStore.setField(formKey, name, v);
    },
  };
}
