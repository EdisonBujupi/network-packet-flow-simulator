import type { LayerMode } from "../simulation/canvasSim";
import type { SimulationConfig } from "../simulation/types";

interface Props {
  config: SimulationConfig;
  setConfig: (p: Partial<SimulationConfig>) => void;
  lossEnabled: boolean;
  setLossEnabled: (v: boolean) => void;
  layerMode: LayerMode;
  setLayerMode: (m: LayerMode) => void;
  running: boolean;
  paused: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}

export function ControlBar({
  config,
  setConfig,
  lossEnabled,
  setLossEnabled,
  layerMode,
  setLayerMode,
  running,
  paused,
  onStart,
  onPause,
  onResume,
  onReset,
}: Props) {
  const busy = running && !paused;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-40"
          disabled={running || paused}
          onClick={onStart}
        >
          Start
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
          disabled={!busy}
          onClick={onPause}
        >
          Pause
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
          disabled={!paused}
          onClick={onResume}
        >
          Resume
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-600 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40"
          disabled={busy}
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        Speed
        <input
          type="range"
          min={0.35}
          max={2.5}
          step={0.05}
          value={config.speedFactor}
          disabled={busy}
          onChange={(e) => setConfig({ speedFactor: Number(e.target.value) })}
          className="w-24"
        />
      </label>

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-600"
          checked={lossEnabled}
          disabled={busy}
          onChange={(e) => setLossEnabled(e.target.checked)}
        />
        Loss
        <input
          type="range"
          min={0}
          max={0.45}
          step={0.01}
          value={config.packetLoss}
          disabled={busy || !lossEnabled}
          onChange={(e) => setConfig({ packetLoss: Number(e.target.value) })}
          className="w-20"
        />
        <span className="w-8 tabular-nums text-slate-500">
          {Math.round(config.packetLoss * 100)}%
        </span>
      </label>

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-600"
          checked={config.useTcp}
          disabled={busy}
          onChange={(e) => setConfig({ useTcp: e.target.checked })}
        />
        TCP
      </label>

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-600"
          checked={config.arpanetMode}
          disabled={busy}
          onChange={(e) => setConfig({ arpanetMode: e.target.checked })}
        />
        ARPANET fail
      </label>

      <label className="flex items-center gap-1 text-[11px] text-slate-400">
        Msg
        <input
          type="text"
          value={config.message}
          disabled={busy}
          onChange={(e) => setConfig({ message: e.target.value.slice(0, 48) })}
          className="w-28 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-[11px] text-cyan-100"
        />
      </label>

      <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
        View:
        {(["physical", "tcp", "ip"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setLayerMode(m)}
            className={`rounded px-2 py-0.5 uppercase ${
              layerMode === m ? "bg-cyan-500/20 text-cyan-200" : "text-slate-500 hover:bg-white/5"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
