import type { TimelineEntry } from "../simulation/canvasSim";
import type { SimMetrics } from "../simulation/canvasSim";

const kindColor: Record<TimelineEntry["kind"], string> = {
  sent: "text-cyan-200/90",
  lost: "text-red-300/90",
  ack: "text-violet-300/90",
  retransmit: "text-amber-200/90",
  dup_ack: "text-orange-200/90",
  protocol: "text-sky-200/90",
  pause: "text-fuchsia-200/90",
  info: "text-slate-400",
};

export function SidePanel({
  timeline,
  selected,
  metrics,
  protocolState,
}: {
  timeline: TimelineEntry[];
  selected: string | null;
  metrics: SimMetrics | null;
  protocolState?: {
    dnsDone: boolean;
    tlsDone: boolean;
    httpRequestSent: boolean;
    httpResponseReceived: boolean;
    dnsCached: boolean;
    dnsTtlSec: number;
  };
}) {
  const rows = timeline.slice(-120);

  return (
    <aside className="flex min-h-0 w-[min(22rem,32vw)] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-panel)]/95">
      <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Debug console
      </div>
      {metrics && (
        <div className="shrink-0 border-b border-[var(--color-border)] px-2 py-2 text-[10px] text-slate-400">
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono">
            <span>t={metrics.now.toFixed(2)}s</span>
            <span>inFlight={metrics.inFlight}</span>
            <span>RTT={metrics.avgRttMs.toFixed(1)}ms</span>
            <span>loss={(metrics.lossRate * 100).toFixed(1)}%</span>
            <span>cwnd={metrics.cwnd.toFixed(2)}</span>
            <span>ssthresh={metrics.ssthresh.toFixed(2)}</span>
            <span>throughput={metrics.throughputBps.toFixed(1)}B/s</span>
            <span>goodput={metrics.goodputBps.toFixed(1)}B/s</span>
          </div>
          {protocolState && (
            <div className="mt-2 border-t border-white/10 pt-1">
              DNS:{protocolState.dnsDone ? "ok" : "..."} TLS:{protocolState.tlsDone ? "ok" : "..."} HTTP
              req:{protocolState.httpRequestSent ? "ok" : "..."} resp:
              {protocolState.httpResponseReceived ? "ok" : "..."} TTL:{protocolState.dnsTtlSec}s
            </div>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 font-mono text-[10px] leading-snug">
        {rows.length === 0 && <p className="text-slate-600">Start the simulation…</p>}
        {rows.map((r) => (
          <div key={r.id} className={`border-b border-white/5 py-1 ${kindColor[r.kind]}`}>
            <span className="text-slate-600">{r.t.toFixed(2)}s</span>{" "}
            <span className="text-slate-500">{r.kind.toUpperCase()}</span>{" "}
            {r.packetId && <span className="text-slate-600">[{r.packetId}]</span>} {r.text}
            {(r.seq !== undefined || r.ack !== undefined) && (
              <span className="text-slate-500">
                {" "}
                seq={r.seq ?? "-"} ack={r.ack ?? "-"}
              </span>
            )}
            {r.path && <span className="text-slate-600"> path={r.path}</span>}
          </div>
        ))}
      </div>
      {selected && (
        <div className="shrink-0 border-t border-[var(--color-border)] px-2 py-2 text-[10px] text-slate-400">
          Selected: {selected}
        </div>
      )}
    </aside>
  );
}
