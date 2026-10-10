import { Popover } from "antd";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { normalizeReasoningEffort, REASONING_LEVELS, type ThinkingEffort } from "./reasoningEffort";
import "./reasoning-effort.css";

export { REASONING_LEVELS, type ThinkingEffort } from "./reasoningEffort";
const STORAGE_KEY = "research.reasoning-effort";
export function readThinkingEffort(): ThinkingEffort {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (REASONING_LEVELS.includes(value as typeof REASONING_LEVELS[number])) return value as ThinkingEffort;
  } catch { /* Use default when storage is unavailable. */ }
  return "medium";
}
export function storeThinkingEffort(value: ThinkingEffort) {
  try { if (value) localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep session selection. */ }
}
type Props = {
  supported: boolean; thinking: boolean; effort: ThinkingEffort;
  levels?: readonly (typeof REASONING_LEVELS)[number][];
  onChange: (thinking: boolean, effort: ThinkingEffort) => void;
  disabled?: boolean; open: boolean; onOpenChange: (open: boolean) => void;
  triggerClassName?: (active?: boolean, disabled?: boolean) => string;
};

type RenderTargets = {
  track: HTMLDivElement | null;
  panel: HTMLDivElement | null;
  trigger: HTMLButtonElement | null;
  level: HTMLSpanElement | null;
  triggerLabel: HTMLSpanElement | null;
};

/**
 * 按连续档位位置渲染轨道。
 *
 * <p>拖动时 ratioIndex 是小数（原生 input 用 step="any"），填充与自绘滑钮据此连续跟随指针；
 * 档位点与文案则按四舍五入后的最近档位显示——视觉连续、语义离散，这两件事必须分开。</p>
 *
 * <p>抽到组件外是为了让「props 同步」和「拖拽预览」两条路径共用同一份 DOM 写入逻辑，
 * 避免像以前那样两处各写一遍、改一处漏一处。</p>
 */
function renderTrack(targets: RenderTargets, levels: readonly string[], maxIndex: number, ratioIndex: number, fallback: string, thinking: boolean) {
  const clamped = Math.min(Math.max(ratioIndex, 0), maxIndex);
  const nearest = Math.round(clamped);
  const nextEffort = levels[nearest] ?? fallback;
  const nextLabel = nextEffort === "ultra" ? "Ultra" : nextEffort;
  const { track, panel, trigger, level, triggerLabel } = targets;

  track?.style.setProperty("--reasoning-ratio", String(maxIndex ? clamped / maxIndex : 0));
  track?.querySelectorAll(".reasoning-stops i").forEach((stop, index) => {
    stop.classList.toggle("active", index <= nearest);
  });
  if (level) level.textContent = nextLabel;
  if (triggerLabel) triggerLabel.textContent = thinking ? nextLabel : "Off";
  track?.querySelector("input")?.setAttribute("aria-valuetext", nextLabel);
  panel?.classList.toggle("reasoning-ultra", nextEffort === "ultra");
  trigger?.classList.toggle("reasoning-ultra", thinking && nextEffort === "ultra");
  trigger?.setAttribute("aria-label", `Reasoning effort: ${thinking ? nextLabel : "Off"}`);
  return nearest;
}

export default function ThinkingToggle({ supported, thinking, effort, levels = REASONING_LEVELS, onChange, disabled, open, onOpenChange, triggerClassName }: Props) {
  const normalizedEffort = normalizeReasoningEffort(effort, levels);
  const value = normalizedEffort ?? "Default";
  const availableLevels = levels;
  const maxIndex = Math.max(availableLevels.length - 1, 0);
  const selectedIndex = normalizedEffort ? Math.max(0, availableLevels.indexOf(normalizedEffort)) : 0;
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerLabelRef = useRef<HTMLSpanElement>(null);
  /** 待提交的整数档位；拖动过程中始终由最近档位更新，松手即提交它。 */
  const indexRef = useRef(selectedIndex);
  const draggingRef = useRef(false);
  const label = value === "ultra" ? "Ultra" : value;
  const ultra = value === "ultra";

  /**
   * 渲染 + 记录待提交档位。
   *
   * <p>必须同时更新 indexRef：renderTrack 只写 DOM，不持有 ref。漏掉这一步的后果是
   * 拖动时视觉连续移动、松手却弹回起始档位——提交值根本没有跟着指针走。</p>
   */
  const render = (ratioIndex: number) => {
    indexRef.current = renderTrack(
      {
        track: trackRef.current,
        panel: panelRef.current,
        trigger: triggerRef.current,
        level: levelRef.current,
        triggerLabel: triggerLabelRef.current,
      },
      availableLevels,
      maxIndex,
      ratioIndex,
      value,
      thinking,
    );
  };

  useEffect(() => {
    if (draggingRef.current) return;
    indexRef.current = selectedIndex;
    // 直接调用而非复用 render 闭包：闭包进不了依赖数组，写进去反而会让 effect 反复触发。
    renderTrack(
      {
        track: trackRef.current,
        panel: panelRef.current,
        trigger: triggerRef.current,
        level: levelRef.current,
        triggerLabel: triggerLabelRef.current,
      },
      availableLevels,
      maxIndex,
      selectedIndex,
      value,
      thinking,
    );
    const input = trackRef.current?.querySelector("input");
    if (input) input.value = String(selectedIndex);
  }, [selectedIndex, availableLevels, maxIndex, value, thinking]);

  /** 松手/回车时把连续位置吸附到最近档位，并提交给上层。 */
  const commit = (snappedIndex: number) => {
    if (disabled || !availableLevels.length) return;
    draggingRef.current = false;
    // 先移除 dragging（恢复过渡），再写位置 —— 吸附这一步才是被动画化的，
    // 拖动过程本身保持零延迟跟随。
    trackRef.current?.classList.remove("reasoning-dragging");
    const bounded = Math.min(Math.max(snappedIndex, 0), maxIndex);
    indexRef.current = bounded;
    render(bounded);
    const input = trackRef.current?.querySelector("input");
    if (input) input.value = String(bounded);
    onChange(thinking, availableLevels[bounded]);
  };

  // 早退必须放在所有 hook 之后：否则 supported 变化时 hook 数量会变，
  // React 会抛 "Rendered more hooks than during the previous render"。
  if (!supported) return null;

  return <Popover trigger="click" placement="topLeft" open={open && !disabled} onOpenChange={onOpenChange}
    content={<div ref={panelRef} className={`reasoning-panel${ultra ? " reasoning-ultra" : ""}`}>
      <div className="reasoning-enable-row">
        <span>Reasoning</span>
        <button type="button" role="switch" aria-label="Enable reasoning" aria-checked={thinking} disabled={disabled}
          className="reasoning-enable-switch" onClick={() => onChange(!thinking, normalizedEffort)}><span /></button>
      </div>
      <div className="reasoning-heading">
        <span ref={levelRef} aria-live="polite">{label}</span>
        <button type="button" className="reasoning-reset" disabled={disabled || !availableLevels.length} aria-label="Reset reasoning effort" title="Reset reasoning effort" onClick={() => {
          const reset = normalizeReasoningEffort(null, availableLevels);
          if (!reset) return;
          render(Math.max(0, availableLevels.indexOf(reset)));
          onChange(thinking, reset);
        }}><RotateCcw size={17} /></button>
      </div>
      {availableLevels.length ? <div ref={trackRef} className="reasoning-track" style={{ "--reasoning-ratio": String(maxIndex ? selectedIndex / maxIndex : 0) } as React.CSSProperties}>
        <div className="reasoning-fill" />
        <div className="reasoning-stops" aria-hidden="true">{availableLevels.map((item, i) => <i key={item} className={i <= selectedIndex ? "active" : ""} />)}</div>
        <div className="reasoning-thumb" aria-hidden="true" />
        <input type="range" min={0} max={maxIndex} step="any" defaultValue={selectedIndex} aria-label="Reasoning effort" aria-valuetext={label} disabled={disabled || availableLevels.length === 1}
          onPointerDown={() => { draggingRef.current = true; trackRef.current?.classList.add("reasoning-dragging"); }}
          onChange={(event) => {
            // 未按下就变化只会来自键盘；键盘路径已在下方接管，这里只处理指针拖动的连续预览。
            if (!draggingRef.current) return;
            render(Number(event.currentTarget.value));
          }}
          onPointerUp={() => commit(indexRef.current)}
          onPointerCancel={() => commit(indexRef.current)}
          onKeyDown={(event) => {
            // step="any" 会让方向键按极小步长移动，必须自己接管，否则键盘完全不可用。
            const current = indexRef.current;
            let next = current;
            if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current - 1;
            else if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current + 1;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = maxIndex;
            else return;
            event.preventDefault();
            commit(next);
          }} />
      </div> : null}
    </div>}>
    <button ref={triggerRef} type="button" disabled={disabled} aria-label={`Reasoning effort: ${thinking ? label : "Off"}`} aria-expanded={open} className={`${triggerClassName?.(open, disabled) ?? ""} reasoning-trigger${thinking && ultra ? " reasoning-ultra" : ""}`}>
      <span ref={triggerLabelRef}>{thinking ? label : "Off"}</span><ChevronDown size={12} />
    </button>
  </Popover>;
}
