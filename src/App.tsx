import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { ControlBar } from "./components/ControlBar";
import { NarrativePanel } from "./components/NarrativePanel";
import { NetworkCanvas } from "./components/NetworkCanvas";
import { SidePanel } from "./components/SidePanel";
import { hitTestPacket } from "./render/drawNetwork";
import { useCanvasSimulation } from "./hooks/useCanvasSimulation";

export default function App() {
  const sim = useCanvasSimulation();
  const snap = sim.snapshot;
  const [selected, setSelected] = useState<string | null>(null);

  const onCanvasClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const simInst = sim.simRef.current;
      if (!simInst) return;
      const canvas = (e.target as HTMLElement).closest("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestPacket(simInst.snapshot(), rect.width, rect.height, x, y);
      if (!hit) {
        setSelected(null);
        simInst.setSelectedPacket(null);
        return;
      }
      simInst.setSelectedPacket(hit.id);
      setSelected(
        `${hit.id} ${hit.kind.toUpperCase()} ${hit.kind === "data" ? `seq=${hit.seqStart}-${hit.seqEnd}` : `ack=${hit.ack}`} | ${hit.lifecycle} | ${hit.srcIp} -> ${hit.dstIp}`,
      );
    },
    [sim.simRef],
  );

  const result = snap?.phase === "done" ? sim.simRef.current?.getResult() ?? null : null;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[var(--color-surface)]">
      <header className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-panel)]/90 px-4 py-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-500/90">Dataflow</p>
            <h1 className="text-lg font-semibold text-white">TCP/IP packet flow</h1>
          </div>
          <p className="max-w-xl text-right text-[11px] text-slate-500">
            Fixed viewport · canvas + one animation loop · cyan = data toward server · violet = ACK toward client
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className="relative min-h-0 flex-1 cursor-crosshair"
            onClick={onCanvasClick}
            role="presentation"
          >
            <NetworkCanvas simRef={sim.simRef} />
          </div>
          <ControlBar
            config={sim.config}
            setConfig={sim.setConfig}
            lossEnabled={sim.lossEnabled}
            setLossEnabled={sim.setLossEnabled}
            layerMode={snap?.layerMode ?? "physical"}
            setLayerMode={sim.setLayerMode}
            running={sim.running}
            paused={sim.paused}
            runtime={sim.runtime}
            setRuntimeControl={sim.setRuntimeControl}
            onStart={sim.start}
            onPause={sim.pause}
            onResume={sim.resume}
            onNext={sim.nextNarrative}
            onStoryMode={sim.storyMode}
            onReset={sim.reset}
          />
          <NarrativePanel
            step={snap?.currentNarrativeStep ?? null}
            onNext={sim.nextNarrative}
            autoPlay={sim.runtime.narrativeAutoPlay}
            activeLayer={snap?.layerMode ?? "physical"}
          />
        </div>
        <SidePanel timeline={snap?.timeline ?? []} selected={selected} />
      </div>

      {result && (
        <div
          className={`shrink-0 border-t border-[var(--color-border)] px-4 py-2 text-[11px] ${
            result.success ? "bg-emerald-950/40 text-emerald-200" : "bg-amber-950/40 text-amber-100"
          }`}
        >
          Delivered: <code className="font-mono">{result.deliveredMessage || "∅"}</code>
          {result.success ? " — OK" : " — incomplete / partial"}
        </div>
      )}
    </div>
  );
}
