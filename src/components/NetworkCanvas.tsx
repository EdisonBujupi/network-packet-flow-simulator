import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { CanvasSimulation } from "../simulation/canvasSim";
import { drawNetwork } from "../render/drawNetwork";

export function NetworkCanvas({ simRef }: { simRef: MutableRefObject<CanvasSimulation | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = parent.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas.parentElement!);

    const loop = (now: number) => {
      const dt = Math.min(0.045, (now - last) / 1000);
      last = now;
      const sim = simRef.current;
      if (sim && sim.phase === "running") {
        sim.tick(dt);
      }
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      if (sim) drawNetwork(ctx, w, h, sim.snapshot());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [simRef]);

  return <canvas ref={canvasRef} className="block h-full min-h-0 w-full" />;
}
