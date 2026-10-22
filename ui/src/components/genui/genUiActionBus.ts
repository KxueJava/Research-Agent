/**
 * GenUI action dispatcher.
 * Renderer stays store-free; ChatView wires adapters via GenUiActionBridge.
 *
 * Default is in-UI interaction (patch_ui / form). Chat turns only when
 * action.type is explicitly "send_message".
 */

export type GenUiActionType =
  | "send_message"
  | "open_url"
  | "navigate"
  | "patch_ui"
  | "set_state"
  | "remote_action"
  | "submit_form";

export type SendMessageActionPayload = {
  content: string;
};

export type OpenUrlActionPayload = {
  url: string;
  external?: boolean;
};

export type NavigateActionPayload = {
  route: string;
};

export type PatchUiActionPayload = {
  patches: Array<{ op: string; path: string; value?: unknown }>;
};

export type SubmitFormActionPayload = {
  actionId?:string;
  formId?: string;
  values: Record<string, unknown>;
};

export type GenUiAction =
  | {type:"remote_action";payload:{actionId:string;values:Record<string,unknown>}}
  | { type:"set_state";payload:{nodeId:string;value:unknown} }
  | { type: "send_message"; payload: SendMessageActionPayload }
  | { type: "open_url"; payload: OpenUrlActionPayload }
  | { type: "navigate"; payload: NavigateActionPayload }
  | { type: "patch_ui"; payload: PatchUiActionPayload }
  | { type: "submit_form"; payload: SubmitFormActionPayload };

export type GenUiActionContext = {
  nodeId?: string;
  baseRevision?:number;
  surfaceId?: string;
  sessionId?: string;
  requestId?: string;
  messageId?: string;
  actionId?: string;
  toggled?: boolean;
  formValues?: Record<string, unknown>;
  formId?: string;
};

export type GenUiActionAdapters = {
  remoteAction?:(payload:{actionId:string;values:Record<string,unknown>},ctx:GenUiActionContext)=>Promise<{status:string}>;
  setState?: (p:{nodeId:string;value:unknown},ctx:GenUiActionContext)=>void;
  sendMessage?: (
    p: SendMessageActionPayload,
    ctx: GenUiActionContext
  ) => void | Promise<void>;
  openUrl?: (p: OpenUrlActionPayload, ctx: GenUiActionContext) => void;
  navigate?: (p: NavigateActionPayload, ctx: GenUiActionContext) => void;
  patchUi?: (p: PatchUiActionPayload, ctx: GenUiActionContext) => void;
  submitForm?: (
    p: SubmitFormActionPayload,
    ctx: GenUiActionContext
  ) => void | Promise<void>;
};

let adapters: GenUiActionAdapters = {};
const registrations:GenUiActionAdapters[]=[];

export function registerGenUiActionAdapters(next: GenUiActionAdapters): ()=>void {
  registrations.push(next);adapters=Object.assign({},...registrations);
  return ()=>{const index=registrations.indexOf(next);if(index>=0)registrations.splice(index,1);adapters=Object.assign({},...registrations);};
}

export function resetGenUiActionAdapters(): void {
  registrations.length=0;
  adapters = {};
}

export function isSafeHref(url: string): boolean {
  if(!url.trim()||/[\u0000-\u0020\u007f]/.test(url))return false;
  try {
    const parsed=new URL(url,"https://app.invalid");
    return ["http:","https:"].includes(parsed.protocol)&&!parsed.username&&!parsed.password;
  } catch {return false;}
}

function isUiPatchArray(
  value: unknown
): value is Array<{ op: string; path: string; value?: unknown }> {
  return (
    Array.isArray(value) &&
    value.every((p) => p && typeof p === "object" && "op" in p && "path" in p)
  );
}

function mergeFormValues(
  inline: unknown,
  ctx: GenUiActionContext
): Record<string, unknown> {
  const fromForm = ctx.formValues ?? {};
  const fromInline =
    inline && typeof inline === "object" && !Array.isArray(inline)
      ? (inline as Record<string, unknown>)
      : {};
  return { ...fromForm, ...fromInline };
}

export function normalizeAction(
  raw: unknown,
  ctx: GenUiActionContext = {}
): GenUiAction | null {
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const type = obj.type;
    const payload = (obj.payload ?? {}) as Record<string, unknown>;
    switch (type) {
      case "remote_action":{
        if(typeof payload.actionId!=="string"||!payload.actionId.trim()||payload.actionId.length>128)return null;
        return {type:"remote_action",payload:{actionId:payload.actionId,values:mergeFormValues(payload.values,ctx)}};
      }
      case "send_message": {
        const content =
          typeof payload.content === "string"
            ? payload.content
            : typeof obj.content === "string"
              ? (obj.content as string)
              : "";
        if (!content.trim()) return null;
        return { type: "send_message", payload: { content } };
      }
      case "open_url": {
        const url = typeof payload.url === "string" ? payload.url : "";
        if (!isSafeHref(url)) return null;
        return {
          type: "open_url",
          payload: { url, external: Boolean(payload.external) },
        };
      }
      case "navigate": {
        const route = typeof payload.route === "string" ? payload.route : "";
        if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\") || !isSafeHref(route)) return null;
        return { type: "navigate", payload: { route } };
      }
      case "patch_ui": {
        const patches = isUiPatchArray(payload.patches) ? payload.patches : [];
        if (!patches.length) return null;
        return { type: "patch_ui", payload: { patches } };
      }
      case "set_state": {
        const {nodeId,value}=payload;
        if(typeof nodeId!=="string"||!nodeId.trim()||nodeId.length>128||["__proto__","constructor","prototype"].includes(nodeId)
          ||!(value===null||typeof value==="string"&&value.length<=65536||typeof value==="number"&&Number.isFinite(value)||typeof value==="boolean"||Array.isArray(value)&&value.length<=1000&&value.every(v=>typeof v==="string")))return null;
        return {type:"set_state",payload:{nodeId,value}};
      }
      case "submit_form": {
        return {
          type: "submit_form",
          payload: {
            formId:
              typeof payload.formId === "string" ? payload.formId : ctx.formId,
            actionId:typeof payload.actionId==="string"?payload.actionId:undefined,
            values: mergeFormValues(payload.values, ctx),
          },
        };
      }
      default:
        break;
    }
  }
  // 不再把裸 actionId/string 当成 send_message，避免点击就往对话发消息。
  return null;
}

export type GenUiDispatchResult = {
  status?:string;
  ok: boolean;
  type?: GenUiActionType;
  reason?: "invalid" | "error";
  error?: unknown;
};

export async function dispatchGenUiAction(
  raw: unknown,
  ctx: GenUiActionContext = {}
): Promise<GenUiDispatchResult> {
  const action = normalizeAction(raw, ctx);
  if (!action) {
    return { ok: false, reason: "invalid" };
  }

  try {
    switch (action.type) {
      case "remote_action":{
        if(!adapters.remoteAction)return {ok:false,reason:"invalid"};
        const execution=await adapters.remoteAction(action.payload,ctx);return {ok:execution.status!=="failed"&&execution.status!=="cancelled",type:action.type,status:execution.status,reason:execution.status==="failed"?"error":undefined};
      }
      case "send_message":
        await adapters.sendMessage?.(action.payload, ctx);
        break;
      case "open_url":
        if (adapters.openUrl) {
          adapters.openUrl(action.payload, ctx);
        } else if (typeof window !== "undefined") {
          const target = action.payload.external === false ? "_self" : "_blank";
          window.open(action.payload.url, target, "noopener,noreferrer");
        }
        break;
      case "navigate":
        if (adapters.navigate) {
          adapters.navigate(action.payload, ctx);
        } else if (typeof window !== "undefined") {
          window.location.href = action.payload.route;
        }
        break;
      case "patch_ui":
        adapters.patchUi?.(action.payload, ctx);
        break;
      case "set_state":
        if(!adapters.setState)return {ok:false,type:action.type,reason:"invalid"};
        adapters.setState(action.payload,ctx);break;
      case "submit_form":
        if(action.payload.actionId){
          if(!adapters.remoteAction)return {ok:false,reason:"invalid"};
          const execution=await adapters.remoteAction({actionId:action.payload.actionId,values:action.payload.values},ctx);
          return {ok:!["failed","cancelled"].includes(execution.status),type:action.type,status:execution.status,reason:execution.status==="failed"?"error":undefined};
        }
        await adapters.submitForm?.(action.payload, ctx);
        break;
    }
    return { ok: true, type: action.type };
  } catch (error) {
    return { ok: false, type: action.type, reason: "error", error };
  }
}

export async function fireGenUiControl(
  props: Record<string, unknown>,
  ctx: GenUiActionContext = {},
  extra?: {
    toggled?: boolean;
    formValues?: Record<string, unknown>;
    formId?: string;
  }
): Promise<GenUiDispatchResult> {
  const action = props.action;
  const actionId =
    typeof props.actionId === "string" ? props.actionId : undefined;
  const base: GenUiActionContext = {
    ...ctx,
    actionId,
    ...extra,
  };
  if (action && typeof action === "object") {
    return dispatchGenUiAction(action, base);
  }
  // 仅当显式 action 为对象时分发；裸 actionId 不再触发聊天。
  return { ok: false, reason: "invalid" };
}
