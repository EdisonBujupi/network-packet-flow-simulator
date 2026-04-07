import type { TimelineEntry } from "../simulation/canvasSim";

const kindColor: Record<TimelineEntry["kind"], string> = {
  sent: "text-cyan-200/90",
  lost: "text-red-300/90",
  ack: "text-violet-300/90",
  retransmit: "text-amber-200/90",
  protocol: "text-sky-200/90",
  info: "text-slate-400",
};

export function SidePanel({
  timeline,
  selected,
}: {
  timeline: TimelineEntry[];
  selected: string | null;
}) {
  const rows = timeline.slice(-120);

  return (
    <aside className="flex min-h-0 w-[min(22rem,32vw)] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-panel)]/95">
      <div className="shrink-0 border-b border-[var(--color-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Event Timeline
      </div>
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
