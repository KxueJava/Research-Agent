import { useEffect } from "react";
import {useUiFeatures} from "./UiFeatures";
import { registerGenUiActionAdapters } from "./genUiActionBus";
import {submitUiAction,uiActionRequestKey,isUiActionUncertainError} from "@/services/uiAction";
import {receiveUiAction,markUncertainUiAction,uiActionSessionEpoch} from "./uiActionState";
import {
  applyLocalUiPatches,
  genUiLocalScopeKey,
  setNodeUiState,
} from "./genUiLocalTreeStore";

type Props = {
  /**
   * Explicit send_message only. In-UI controls default to local patch/form.
   */
  sendMessage?: (message: string) => void;
  /** True while an agent run is in progress — chat inject is ignored. */
  busy?: boolean;
};

/**
 * Mount near ChatView root so Button/Form actions stay inside GenUI by default.
 */
export function GenUiActionBridge({ sendMessage, busy }: Props) {
  const features=useUiFeatures();
  useEffect(() => {
    return registerGenUiActionAdapters({
      async remoteAction(payload,ctx){
        if(!features.actions)throw Error("远程动作已关闭，已有结果仍可查看或取消");
        if(!ctx.sessionId||!ctx.surfaceId||!ctx.nodeId||!ctx.baseRevision)throw Error("界面尚未同步到可执行版本");
        const epoch=uiActionSessionEpoch(ctx.sessionId);
        const value={surfaceId:ctx.surfaceId,componentId:ctx.nodeId,actionId:payload.actionId,baseRevision:ctx.baseRevision,payload:payload.values};
        try{
          const execution=await submitUiAction(ctx.sessionId,value);
          if(uiActionSessionEpoch(ctx.sessionId)===epoch)receiveUiAction(execution);
          return execution;
        }catch(error){
          const key=uiActionRequestKey(ctx.sessionId,value);
          if(key&&isUiActionUncertainError(error)&&uiActionSessionEpoch(ctx.sessionId)===epoch)markUncertainUiAction(ctx.sessionId,ctx.surfaceId,key);
          throw error;
        }
      },
      setState(payload,ctx){
        if(!ctx.sessionId||!ctx.surfaceId)throw new Error("Missing Surface identity");
        setNodeUiState(genUiLocalScopeKey(ctx.sessionId,ctx.messageId,ctx.surfaceId),payload.nodeId,payload.value);
      },
      sendMessage(payload) {
        const content = (payload.content || "").trim();
        if (!content || busy || !sendMessage) throw Error("当前无法启动 Agent，请稍后重试");
        sendMessage(content);
      },
      patchUi(payload, ctx) {
        const key = genUiLocalScopeKey(ctx.sessionId, ctx.messageId, ctx.surfaceId);
        applyLocalUiPatches(key, payload.patches || []);
      },
      submitForm(payload, ctx) {
        // 表单值已在 genUiFormsStore 内；提交默认留在 UI，不发聊天。
        // 若模型同时给了 patch_ui 语义，可在 action 上直接用 type: patch_ui。
        // 需要 Agent 接手时使用 type: send_message。
        void payload;
        void ctx;
      },
      openUrl(payload) {
        if (typeof window === "undefined") return;
        const target = payload.external === false ? "_self" : "_blank";
        window.open(payload.url, target, "noopener,noreferrer");
      },
      navigate(payload) {
        if (typeof window === "undefined") return;
        window.location.href = payload.route;
      },
    });
  }, [sendMessage, busy,features.actions]);

  return null;
}

export default GenUiActionBridge;
