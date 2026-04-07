import { useState } from "react";

const sections = [
  {
    title: "Application layer",
    body:
      "Your program (browser, game, SSH client) produces bytes — for example an HTTP body or a login string. This layer does not know how packets traverse the internet; it hands data to the transport layer.",
  },
  {
    title: "Transport (TCP)",
    body:
      "TCP splits the byte stream into segments, assigns ports (which application socket), sequence numbers (ordering), and acknowledgements. If a segment is lost or corrupted, TCP can retransmit until the data is delivered or the connection fails.",
  },
  {
    title: "Internet (IP)",
    body:
      "IP adds logical addresses (source and destination) so routers can forward toward the destination network. IP is best-effort: it does not guarantee delivery — reliability is an end-to-end concern for TCP.",
  },
  {
    title: "Data link & physical",
    body:
      "On each hop, frames carry MAC addresses for the local link, and the physical layer encodes bits on copper, fiber, or radio. Each router strips and rebuilds link headers while preserving the IP payload.",
  },
  {
    title: "Why TCP exists",
    body:
      "IP alone can drop, reorder, or duplicate packets. Applications would need their own error handling. TCP provides a reliable, ordered byte stream so developers can focus on protocol semantics (HTTP, SMTP, …) instead of retransmissions on every app.",
  },
  {
    title: "ARPANET lesson",
    body:
      "Early packet networks proved switching and routing. End-to-end reliability was not guaranteed at first; applications could see partial data. TCP (and later UDP for speed) standardized how hosts share the network responsibly and predictably.",
  },
] as const;

export function EducationPanel() {
  const [open, setOpen] = useState(0);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Educational mode
      </h2>
      <div className="flex flex-col gap-2 md:flex-row">
        <div className="flex shrink-0 flex-col gap-1 md:w-48">
          {sections.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => setOpen(i)}
              className={`rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                open === i
                  ? "bg-cyan-500/15 text-cyan-100 ring-1 ring-cyan-500/40"
                  : "text-slate-400 hover:bg-white/5"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
        <article className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 text-sm leading-relaxed text-slate-300">
          <h3 className="mb-2 font-medium text-slate-100">{sections[open]?.title}</h3>
          <p>{sections[open]?.body}</p>
        </article>
      </div>
    </section>
  );
}
