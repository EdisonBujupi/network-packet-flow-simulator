import { Controls } from "./components/Controls";
import { CaptureBonus } from "./components/CaptureBonus";
import { EducationPanel } from "./components/EducationPanel";
import { EventLog } from "./components/EventLog";
import { LayerPipeline } from "./components/LayerPipeline";
import { NetworkTopology } from "./components/NetworkTopology";
import { PacketStructure } from "./components/PacketStructure";
import { Timeline } from "./components/Timeline";
import { useSimulation } from "./hooks/useSimulation";

export default function App() {
  const sim = useSimulation();

  return (
    <div className="min-h-full">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-panel)]/50 px-6 py-6 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-500/90">Dataflow</p>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">
              TCP/IP stack &amp; network simulator
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Watch a message move from the application layer down to bits, across routers, and back with ACKs —
              including loss, checksums, and retransmissions.
            </p>
          </div>
          <div className="text-right text-xs text-slate-500">
            {sim.running ? (
              <span className="text-cyan-400">Running…</span>
            ) : (
              <span>Idle — adjust controls and press Run</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">
        <Controls
          config={sim.config}
          onChange={(p) => sim.setConfig((c) => ({ ...c, ...p }))}
          running={sim.running}
          onStart={sim.start}
          onStop={sim.stop}
          onReset={sim.reset}
        />

        {sim.result && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              sim.result.success
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-amber-500/40 bg-amber-500/10 text-amber-100"
            }`}
          >
            <strong className="font-medium">Result: </strong>
            {sim.result.crashed && "Partial / inconsistent state — "}
            Delivered to application:{" "}
            <code className="rounded bg-black/30 px-1 font-mono">
              {sim.result.deliveredMessage || "(empty)"}
            </code>
            {sim.result.success ? " — matches original message." : " — does not match the full input."}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <NetworkTopology event={sim.lastEvent} />
            <LayerPipeline event={sim.lastEvent} />
            <PacketStructure event={sim.lastEvent} useTcp={sim.config.useTcp} />
          </div>
          <div className="space-y-6">
            <Timeline items={sim.timeline} />
            <EventLog logs={sim.logs} />
          </div>
        </div>

        <EducationPanel />
        <CaptureBonus />
      </main>

      <footer className="border-t border-[var(--color-border)] px-6 py-8 text-center text-xs text-slate-600">
        Educational simplification — not a substitute for RFCs, kernel TCP, or lab measurements.
      </footer>
    </div>
  );
}
