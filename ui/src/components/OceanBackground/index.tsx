import { useEffect, useRef } from "react";

/** One decorative canvas shared by every route; never intercepts user input. */
export default function OceanBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Lazy-load the existing Three.js dependency; UI and authentication render first.
    void import("./scene").then(({ createOceanScene }) => {
      if (!cancelled) dispose = createOceanScene(canvas);
    }).catch(() => { if (!cancelled) canvas.dataset.state = "static"; });
    return () => { cancelled = true; dispose?.(); };
  }, []);
  return <div className="ocean-environment" aria-hidden="true">
    <canvas ref={canvasRef} className="ocean-canvas" data-state="static" />
  </div>;
}
