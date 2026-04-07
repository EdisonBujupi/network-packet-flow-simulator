import type { NarrativeStep } from "../simulation/canvasSim";

export function NarrativePanel({
  step,
  onNext,
  autoPlay,
}: {
  step: NarrativeStep | null;
  onNext: () => void;
  autoPlay: boolean;
}) {
  return (
    <section className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-panel)]/95 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
            Guided Narrative
          </p>
          {!step && (
            <p className="text-sm text-slate-400">
              Simulation is running. Pause points will appear here.
            </p>
          )}
          {step && (
            <>
              <p className="text-sm font-semibold text-white">
                Layer: <span className="text-cyan-300 uppercase">{step.layer}</span>
              </p>
              <p className="mt-1 text-sm text-slate-300">{step.explanation}</p>
              <p className="mt-1 text-xs font-mono text-slate-500">
                Packet: {step.packetState} | Location: {step.location}
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          disabled={!step || autoPlay}
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </section>
  );
}
