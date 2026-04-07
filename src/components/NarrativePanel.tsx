import type { NarrativeStep } from "../simulation/canvasSim";
import type { LayerMode } from "../simulation/canvasSim";

function explainForLayer(step: NarrativeStep, activeLayer: LayerMode): string {
  if (activeLayer === "application") {
    if (step.id === "app_start") return "The browser/app creates an HTTP request message.";
    if (step.id === "complete") return "The full response is reconstructed and delivered to the app.";
    return "At the application layer, we focus on request/response meaning.";
  }
  if (activeLayer === "tcp") {
    if (step.id === "tcp_segment") return "TCP splits the message into segments and assigns sequence numbers.";
    if (step.id === "ack_return") return "TCP ACK confirms delivery so missing data can be retransmitted.";
    return "TCP provides reliability with sequence and acknowledgment.";
  }
  if (activeLayer === "ip") {
    if (step.id === "ip_wrap") return "IP adds source/destination addresses to route packets.";
    if (step.id === "router_forward") return "Routers forward packets hop-by-hop using IP destination.";
    return "IP handles addressing and routing, not message reliability.";
  }
  return "Physical signals carry bits over links between nodes.";
}

export function NarrativePanel({
  step,
  onNext,
  autoPlay,
  activeLayer,
}: {
  step: NarrativeStep | null;
  onNext: () => void;
  autoPlay: boolean;
  activeLayer: LayerMode;
}) {
  const recommended = step?.layer ?? activeLayer;
  const body = step ? explainForLayer(step, activeLayer) : null;

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
                Layer:{" "}
                <span className="text-cyan-300 uppercase">
                  {activeLayer}
                </span>{" "}
                {activeLayer !== recommended && (
                  <span className="text-amber-300">(recommended: {recommended})</span>
                )}
              </p>
              <p className="mt-1 text-sm text-slate-300">{body}</p>
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
