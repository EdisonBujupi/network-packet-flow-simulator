export function Timeline({
  items,
}: {
  items: { t: number; label: string }[];
}) {
  const recent = items.slice(-24);
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Timeline (recent)
      </h2>
      <div className="max-h-40 overflow-y-auto font-mono text-[10px] leading-snug text-slate-400">
        {recent.length === 0 && <p className="text-slate-600">No events yet.</p>}
        {recent.map((it, i) => (
          <div key={`${it.t}-${i}`} className="flex gap-2 border-b border-white/5 py-0.5">
            <span className="w-8 shrink-0 text-cyan-600/80">{it.t}</span>
            <span className="text-slate-300">{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
