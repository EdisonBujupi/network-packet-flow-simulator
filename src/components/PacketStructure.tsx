import type { ReactNode } from "react";
import type { SimEvent } from "../simulation/types";

export function PacketStructure({
  event,
  useTcp,
}: {
  event: SimEvent | null;
  useTcp: boolean;
}) {
  const tcp = event?.tcp;
  const ip = event?.ip;
  const mac = event?.mac;

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Packet structure viewer
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Headers update as each layer wraps the payload. Values are illustrative for teaching.
      </p>
      <div className="space-y-3 font-mono text-xs">
        <Block title={useTcp ? "TCP header" : "UDP header (simplified)"} visible={!!tcp}>
          {tcp && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-300">
              <dt className="text-slate-500">Src / Dst port</dt>
              <dd>
                {tcp.srcPort} → {tcp.dstPort}
              </dd>
              <dt className="text-slate-500">{useTcp ? "Seq / Ack" : "Length / checksum"}</dt>
              <dd>
                {useTcp ? (
                  <>
                    {tcp.seq} / {tcp.ack}
                  </>
                ) : (
                  <>{tcp.payload.length} B / {tcp.checksum}</>
                )}
              </dd>
              <dt className="text-slate-500">{useTcp ? "Flags" : "PSH-style"}</dt>
              <dd>{useTcp ? tcp.flags.join(", ") : "Single datagram"}</dd>
              <dt className="text-slate-500">Checksum</dt>
              <dd className="break-all text-cyan-200/90">{tcp.checksum}</dd>
              <dt className="text-slate-500">Payload</dt>
              <dd className="text-amber-200/90">{tcp.payload || "∅"}</dd>
            </dl>
          )}
        </Block>
        <Block title="IPv4 header" visible={!!ip}>
          {ip && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-300">
              <dt className="text-slate-500">Src / Dst</dt>
              <dd>
                {ip.src} → {ip.dst}
              </dd>
              <dt className="text-slate-500">Protocol</dt>
              <dd>
                {ip.protocol} ({ip.protocol === 6 ? "TCP" : "UDP"})
              </dd>
              <dt className="text-slate-500">TTL / ID</dt>
              <dd>
                {ip.ttl} / {ip.id}
              </dd>
              <dt className="text-slate-500">Total length</dt>
              <dd>{ip.totalLength} B (edu.)</dd>
            </dl>
          )}
        </Block>
        <Block title="Ethernet frame" visible={!!mac}>
          {mac && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-300">
              <dt className="text-slate-500">Dst / Src MAC</dt>
              <dd className="break-all">
                {mac.dst} ← {mac.src}
              </dd>
              <dt className="text-slate-500">EtherType</dt>
              <dd>{mac.ethertype}</dd>
            </dl>
          )}
        </Block>
        {event?.type === "physical_bits" && event.bitsPreview && (
          <div className="rounded border border-slate-700 bg-black/40 p-2 text-[10px] leading-relaxed text-emerald-300/90">
            <div className="mb-1 text-slate-500">Physical (bits)</div>
            {event.bitsPreview}
          </div>
        )}
      </div>
    </section>
  );
}

function Block({
  title,
  visible,
  children,
}: {
  title: string;
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-2 transition-opacity ${
        visible
          ? "border-cyan-500/40 bg-cyan-500/5 opacity-100"
          : "border-[var(--color-border)] opacity-40"
      }`}
    >
      <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
      {children}
    </div>
  );
}
