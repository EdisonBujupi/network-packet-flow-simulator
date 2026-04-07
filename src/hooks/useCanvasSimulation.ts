import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasSimulation } from "../simulation/canvasSim";
import type { LayerMode } from "../simulation/canvasSim";
import type { RuntimeControls } from "../simulation/canvasSim";
import type { SimulationConfig } from "../simulation/types";

const defaultConfig: SimulationConfig = {
  message: "LOGIN",
  packetLoss: 0.15,
  delayMs: 120,
  speedFactor: 1,
  useTcp: true,
  checksumEnabled: true,
  arpanetMode: false,
};

export function useCanvasSimulation() {
  const simRef = useRef<CanvasSimulation | null>(null);
  if (!simRef.current) {
    simRef.current = new CanvasSimulation(defaultConfig);
  }

  const [config, setConfigState] = useState<SimulationConfig>(defaultConfig);
  const [lossEnabled, setLossEnabled] = useState(true);
  const [runtime, setRuntime] = useState<RuntimeControls>({
    timeScale: 1,
    stepMode: false,
    pauseOnLoss: false,
    pauseOnRetransmit: false,
  });
  /** Throttled UI refresh for sidebar (canvas draws every frame independently) */
  const [ui, setUi] = useState(0);
  const bump = useCallback(() => setUi((x) => x + 1), []);

  const setConfig = useCallback(
    (patch: Partial<SimulationConfig>) => {
      setConfigState((c) => {
        const n = { ...c, ...patch };
        simRef.current?.setConfig(n);
        return n;
      });
    },
    [],
  );

  const snapshot = useMemo(() => {
    void ui;
    return simRef.current?.snapshot() ?? null;
  }, [ui]);

  useEffect(() => {
    const id = window.setInterval(() => bump(), 320);
    return () => window.clearInterval(id);
  }, [bump]);

  const start = useCallback(() => {
    const sim = simRef.current!;
    sim.setConfig({
      ...config,
      packetLoss: lossEnabled ? config.packetLoss : 0,
    });
    sim.start();
    bump();
  }, [bump, config, lossEnabled]);

  const pause = useCallback(() => {
    simRef.current?.pause();
    bump();
  }, [bump]);

  const resume = useCallback(() => {
    simRef.current?.resume();
    bump();
  }, [bump]);

  const reset = useCallback(() => {
    simRef.current?.reset();
    bump();
  }, [bump]);

  const setLayerMode = useCallback(
    (m: LayerMode) => {
      simRef.current?.setLayerMode(m);
      bump();
    },
    [bump],
  );

  const setRuntimeControl = useCallback((patch: Partial<RuntimeControls>) => {
    setRuntime((prev) => {
      const next = { ...prev, ...patch };
      simRef.current?.configureRuntime(next);
      return next;
    });
  }, []);

  const step = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.configureRuntime({ stepMode: true });
    sim.requestStep(0.36);
    bump();
  }, [bump]);

  const phase = snapshot?.phase;
  const running = phase === "running";
  const paused = phase === "paused";

  return {
    simRef,
    config,
    setConfig,
    lossEnabled,
    setLossEnabled,
    snapshot,
    start,
    pause,
    resume,
    reset,
    setLayerMode,
    runtime,
    setRuntimeControl,
    step,
    running,
    paused,
    bump,
  };
}
