import { memo, useEffect, useMemo, useState,type ReactNode } from "react";
import { Maximize2, PanelRight, Sparkles, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import classNames from "classnames";
import GenUiNode, { type GenUiNodeData } from "./GenUiNode";
import { GenUiRenderProvider, type SurfaceSyncNotice } from "./GenUiRenderContext";
import { applyUiPatches } from "./applyUiPatch";
import { useSurfaceMode } from "../artifacts/useSurfaceMode";
import "../artifacts/artifact.css";

type Props = {
  tree?: any;
  patches?: Array<{ op: string; path: string; value?: unknown }>;
  className?: string;
  patchCount?: number;
  sessionId?: string;
  requestId?: string;
  messageId?: string;
  surfaceId?: string;
  baseRevision?:number;
  surfaceSync?:SurfaceSyncNotice;
  recoveryNotice?:ReactNode;
};

const GenUiInline = memo(({ tree, patches, className, patchCount, sessionId, requestId, messageId, surfaceId,baseRevision,surfaceSync,recoveryNotice }: Props) => {
  const { mode, setMode, host } = useSurfaceMode();
  const [patchFlash, setPatchFlash] = useState(false);
  const reduceMotion = useReducedMotion();
  const resolved = useMemo(() => tree && patches?.length ? applyUiPatches(tree, patches) : tree, [tree, patches]);
  const root: GenUiNodeData | null = resolved?.root || (resolved?.kind ? resolved : null);
  const mapOnly = root?.kind === "MapWidget";
  useEffect(() => {
    if (!patchCount || reduceMotion) return;
    setPatchFlash(true);
    const timer = window.setTimeout(() => setPatchFlash(false), 700);
    return () => window.clearTimeout(timer);
  }, [patchCount, reduceMotion]);
  if (!root) return null;
  return <section className={classNames("genui-slot", className)} aria-label="GenUI 画布">
    <div ref={host} popover={mode === "inline" ? undefined : "manual"}
      className={classNames("artifact-surface genui-surface", mapOnly && "genui-map-surface")} data-mode={mode} data-surface-id={surfaceId}>
      {!mapOnly && <header className="artifact-toolbar">
        <div className="artifact-title"><Sparkles size={15} /><strong>交互演示</strong>
          {Boolean(patchCount) && <span role="status">已合并 {patchCount} 条补丁</span>}
        </div>
        <div className="artifact-actions">
          <button type="button" aria-label={mode === "sidebar" ? "返回聊天" : "侧栏展示"} onClick={() => setMode(mode === "sidebar" ? "inline" : "sidebar")}><PanelRight size={15} /></button>
          <button type="button" aria-label={mode === "immersive" ? "退出沉浸" : "沉浸展示"} onClick={() => setMode(mode === "immersive" ? "inline" : "immersive")}><Maximize2 size={15} />沉浸</button>
          {mode !== "inline" && <button type="button" aria-label="关闭扩展画布" onClick={() => setMode("inline")}><X size={15} /></button>}
        </div>
      </header>}
      <div className="genui-surface-body">
        {recoveryNotice}
        <GenUiRenderProvider value={{ sessionId, requestId, messageId, surfaceId,baseRevision,surfaceSync }}>
          <motion.div className={classNames("genui-root", patchFlash && "genui-patch-flash")}>
            <GenUiNode node={root} />
          </motion.div>
        </GenUiRenderProvider>
      </div>
    </div>
  </section>;
});
GenUiInline.displayName = "GenUiInline";
export default GenUiInline;
