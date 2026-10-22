import { useLayoutEffect, useRef, useState } from "react";

export type SurfaceMode = "inline" | "sidebar" | "immersive";

/** Change presentation on the existing host; never move or clone its children. */
export function useSurfaceMode() {
  const [mode, setMode] = useState<SurfaceMode>("inline");
  const host = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element || mode === "inline") return;
    returnFocus.current ??= document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof element.showPopover === "function" && !element.matches(":popover-open")) element.showPopover();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setMode("inline"); }
    };
    element.addEventListener("keydown", close);
    return () => {
      element.removeEventListener("keydown", close);
      if (typeof element.hidePopover === "function" && element.matches(":popover-open")) element.hidePopover();
    };
  }, [mode]);
  useLayoutEffect(() => {
    if (mode === "inline" && returnFocus.current) {
      if (returnFocus.current.isConnected) returnFocus.current.focus({ preventScroll: true });
      returnFocus.current = null;
    }
  }, [mode]);
  return { mode, setMode, host };
}
