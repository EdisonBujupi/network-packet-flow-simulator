import type { SimulationConfig } from "../simulation/types";

interface Props {
  config: SimulationConfig;
  onChange: (c: Partial<SimulationConfig>) => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

export function Controls({
  config,
  onChange,
  running,
  onStart,
  onStop,
  onReset,
}: Props) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90 p-4 shadow-lg backdrop-blur">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Simulation controls
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Message</span>
          <input
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-cyan-100 outline-none ring-cyan-500/30 focus:ring-2"
            value={config.message}
            disabled={running}
            onChange={(e) => onChange({ message: e.target.value })}
            maxLength={64}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">
            Packet loss probability ({Math.round(config.packetLoss * 100)}%)
          </span>
          <input
            type="range"
            min={0}
            max={0.45}
            step={0.01}
            value={config.packetLoss}
            disabled={running}
            onChange={(e) => onChange({ packetLoss: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Network delay (ms / hop scale)</span>
          <input
            type="range"
            min={40}
            max={400}
            step={10}
            value={config.delayMs}
            disabled={running}
            onChange={(e) => onChange({ delayMs: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-400">Animation speed</span>
          <input
            type="range"
            min={0.35}
            max={2.5}
            step={0.05}
            value={config.speedFactor}
            disabled={running}
            onChange={(e) => onChange({ speedFactor: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--color-border)] pt-4">
        <Toggle
          label="Use TCP (reliable)"
          checked={config.useTcp}
          disabled={running}
          onChange={(v) => onChange({ useTcp: v })}
        />
        <Toggle
          label="Checksum validation"
          checked={config.checksumEnabled}
          disabled={running}
          onChange={(v) => onChange({ checksumEnabled: v })}
        />
        <Toggle
          label="ARPANET-style failure"
          checked={config.arpanetMode}
          disabled={running}
          onChange={(v) => onChange({ arpanetMode: v })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 shadow hover:bg-cyan-400 disabled:opacity-40"
          disabled={running}
          onClick={onStart}
        >
          Run simulation
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:opacity-40"
          disabled={!running}
          onClick={onStop}
        >
          Stop
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
          disabled={running}
          onClick={onReset}
        >
          Clear
        </button>
      </div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-500 bg-slate-800 text-cyan-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
