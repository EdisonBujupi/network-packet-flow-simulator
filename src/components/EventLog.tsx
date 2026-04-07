import { useEffect, useRef } from "react";
import type { LogEntry } from "../hooks/useSimulation";

const kindClass: Record<LogEntry["kind"], string> = {
  info: "text-slate-300",
  warn: "text-amber-200/90",
  danger: "text-red-300/90",
  ok: "text-emerald-300/90",
};

export function EventLog({ logs }: { logs: LogEntry[] }) {
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <section className="flex max-h-72 flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90">
      <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Event log
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 && (
          <p className="text-slate-500">Run a simulation to see sent packets, ACKs, loss, and retransmissions.</p>
        )}
        {logs.map((l) => (
          <div key={l.id} className={`border-b border-white/5 py-1 ${kindClass[l.kind]}`}>
            <span className="text-slate-600">
              {new Date(l.at).toLocaleTimeString(undefined, {
                hour12: false,
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>{" "}
            {l.label}
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </section>
  );
}
