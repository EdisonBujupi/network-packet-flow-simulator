/**
 * Bonus: points users to real capture tools (read-only educational use).
 * This app does not ship packet capture; it documents how to observe real traffic safely.
 */
export function CaptureBonus() {
  return (
    <section className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
        Bonus: real packet capture
      </h2>
      <p className="text-sm leading-relaxed text-slate-400">
        To see real TCP segments and HTTP on your machine, use{" "}
        <a
          className="text-cyan-400 underline-offset-2 hover:underline"
          href="https://www.wireshark.org/"
          target="_blank"
          rel="noreferrer"
        >
          Wireshark
        </a>{" "}
        or{" "}
        <code className="rounded bg-black/40 px-1 text-cyan-200/80">tcpdump</code> on an interface you are
        allowed to monitor. Filter example:{" "}
        <code className="break-all rounded bg-black/40 px-1 text-[11px] text-slate-300">
          tcp port 80 and host example.com
        </code>
        . This simulator remains self-contained; capture is optional homework.
      </p>
    </section>
  );
}
