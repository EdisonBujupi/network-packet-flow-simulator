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
  const [hoverTip, setHoverTip] = useState<string | null>(null);

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

  const onCanvasMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const simInst = sim.simRef.current;
      if (!simInst) return;
      const canvas = (e.target as HTMLElement).closest("canvas");
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const hit = hitTestPacket(
        simInst.snapshot(),
        rect.width,
        rect.height,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      if (!hit) {
        setHoverTip(null);
        return;
      }
      setHoverTip(
        `${hit.id} | ${hit.srcIp} -> ${hit.dstIp} | ${hit.kind === "data" ? `SEQ ${hit.seqStart}-${hit.seqEnd}` : `ACK ${hit.ack}`} | trust=${hit.trustState}`,
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
            <h1 className="text-lg font-semibold text-white">Cybersecurity Network Behavior Lab</h1>
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
            onMouseMove={onCanvasMove}
            onMouseLeave={() => setHoverTip(null)}
            role="presentation"
          >
            <NetworkCanvas simRef={sim.simRef} />
            {hoverTip && (
              <div className="pointer-events-none absolute left-2 top-2 rounded border border-slate-700 bg-slate-950/85 px-2 py-1 text-[11px] font-mono text-cyan-200">
                {hoverTip}
              </div>
            )}
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
            onStoryMode={sim.storyMode}
            onExportLogs={sim.exportLogs}
            onReset={sim.reset}
          />
          <NarrativePanel
            step={snap?.currentNarrativeStep ?? null}
            activeLayer={snap?.layerMode ?? "physical"}
            focusedPacket={snap?.focusedPacket ?? null}
                advanced={snap?.runtime.advancedMode ?? false}
          />
        </div>
        <SidePanel
          timeline={snap?.timeline ?? []}
          selected={selected}
          advanced={snap?.runtime.advancedMode ?? false}
        />
      </div>

      {result && (
        <div
          className={`shrink-0 border-t border-[var(--color-border)] px-4 py-2 text-[11px] ${
            result.success ? "bg-emerald-950/40 text-emerald-200" : "bg-amber-950/40 text-amber-100"
          }`}
        >
          Delivered: <code className="font-mono">{result.deliveredMessage || "∅"}</code>
          {result.success ? " — OK" : " — incomplete / partial"}
          {snap && (
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300">
              <span>Total sent: {snap.metrics.totalSent}</span>
              <span>Total received (ACKed): {snap.metrics.totalAcked}</span>
              <span>Retransmissions: {snap.metrics.totalRetransmit}</span>
              <span>Loss rate: {(snap.metrics.lossRate * 100).toFixed(1)}%</span>
              <span>Security events: {snap.metrics.securityEvents}</span>
              <span>Active attacks: {snap.securitySummary.attacks.join(", ") || "none"}</span>
              <span>
                Layers: PHY {snap.layerBreakdown.physical} / IP {snap.layerBreakdown.ip} / TCP {snap.layerBreakdown.tcp} /
                APP {snap.layerBreakdown.application}
              </span>
              <span>Learning: TCP reliability, DNS name to IP, HTTP request/response, TLS encryption.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
