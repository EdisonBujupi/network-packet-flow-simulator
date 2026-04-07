import type { NarrativeStep } from "../simulation/canvasSim";
import type { LayerMode } from "../simulation/canvasSim";

function explainForLayer(step: NarrativeStep, activeLayer: LayerMode): string {
  if (activeLayer === "application") {
    if (step.id === "app_start") return "The browser/app creates an HTTP request message.";
    if (step.id === "dns_lookup") return "DNS converts domain names (like example.com) into IP addresses.";
    if (step.id === "tls_handshake")
      return "TLS verifies identity and creates encrypted keys, blocking many man-in-the-middle attacks.";
    if (step.id === "http_exchange") return "HTTP request asks for data; HTTP response returns content and status.";
    if (step.id === "cookie_state") return "Cookies store session state so the server can remember the user.";
    if (step.id === "complete") return "The full response is reconstructed and delivered to the app.";
    return "At the application layer, we focus on request/response meaning.";
  }
  if (activeLayer === "tcp") {
    if (step.id === "tcp_segment") return "TCP splits the message into segments and assigns sequence numbers.";
    if (step.id === "tcp_loss_detected") return "TCP notices missing progress and detects packet loss.";
    if (step.id === "tcp_retransmit_story") return "TCP resends missing packets automatically to recover reliability.";
    if (step.id === "tcp_reorder_reassembly") return "TCP reorders received segments and reconstructs the original stream.";
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
  activeLayer,
  focusedPacket,
}: {
  step: NarrativeStep | null;
  activeLayer: LayerMode;
  focusedPacket: {
    id: string;
    origin: string;
    path: string;
    destination: string;
    layerStatus: string;
    lifecycle: string;
    seqRange?: string;
    ack?: number;
    signalTimingMs?: number;
    signalError?: string;
    ipHop?: string;
    fragmentInfo?: string;
    appPurpose?: string;
  } | null;
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
              Simulation is running continuously with automatic guided explanations.
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
              {focusedPacket && (
                <div className="mt-2 rounded border border-slate-700/70 bg-slate-950/45 p-2 text-xs text-slate-300">
                  <p className="font-mono text-[11px] text-cyan-200">
                    {focusedPacket.id} | {focusedPacket.origin} {"->"} {focusedPacket.destination}
                  </p>
                  <p className="font-mono text-[11px] text-slate-400">Path: {focusedPacket.path}</p>
                  <p className="text-[12px] text-slate-300">Status: {focusedPacket.layerStatus} ({focusedPacket.lifecycle})</p>
                  {activeLayer === "physical" && (
                    <p className="text-[12px] text-emerald-300/90">
                      Bits are propagating over links (~{focusedPacket.signalTimingMs ?? 0} ms).
                      {focusedPacket.signalError ? ` Error: ${focusedPacket.signalError}` : " No physical errors detected."}
                    </p>
                  )}
                  {activeLayer === "ip" && (
                    <p className="text-[12px] text-blue-300/90">
                      IP routes from {focusedPacket.origin} to {focusedPacket.destination} via {focusedPacket.ipHop ?? "current hop"}.
                      {focusedPacket.fragmentInfo ? ` ${focusedPacket.fragmentInfo}.` : ""}
                    </p>
                  )}
                  {activeLayer === "tcp" && (
                    <p className="text-[12px] text-cyan-200/90">
                      TCP {focusedPacket.seqRange ? `SEQ ${focusedPacket.seqRange}` : ""}
                      {focusedPacket.ack !== undefined ? ` ACK ${focusedPacket.ack}` : ""}.
                      {focusedPacket.lifecycle === "retransmitting" || focusedPacket.signalError
                        ? " Packet is resent because reliability requires confirmed delivery."
                        : " Reliability is maintained through sequencing and acknowledgments."}
                    </p>
                  )}
                  {activeLayer === "application" && (
                    <p className="text-[12px] text-violet-200/90">
                      {focusedPacket.appPurpose ?? "This packet belongs to application request/response flow."}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
