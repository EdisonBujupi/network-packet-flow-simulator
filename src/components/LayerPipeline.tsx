import { motion } from "framer-motion";
import type { SimEvent } from "../simulation/types";

const layers = [
  { id: "application", label: "Application", desc: "HTTP, SSH, your app data" },
  { id: "tcp", label: "Transport (TCP)", desc: "Ports, seq, ACK, reliability" },
  { id: "ip", label: "Internet (IP)", desc: "Logical addressing & routing" },
  { id: "datalink", label: "Data link", desc: "MAC addressing, framing" },
  { id: "physical", label: "Physical", desc: "Bits on the medium" },
] as const;

function activeLayerForEvent(e: SimEvent | null): string | null {
  if (!e) return null;
  switch (e.type) {
    case "application_out":
      return "application";
    case "tcp_segment":
    case "ack_sent":
    case "ack_received":
      return "tcp";
    case "ip_datagram":
      return "ip";
    case "ethernet_frame":
      return "datalink";
    case "physical_bits":
      return "physical";
    case "route_hop":
    case "packet_lost":
    case "retransmit":
      return "physical";
    default:
      return null;
  }
}

export function LayerPipeline({ event }: { event: SimEvent | null }) {
  const active = activeLayerForEvent(event);

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
        TCP/IP stack (sender)
      </h2>
      <div className="flex flex-col gap-2">
        {layers.map((L) => {
          const isActive = active === L.id;
          return (
            <motion.div
              key={L.id}
              layout
              className={`relative overflow-hidden rounded-lg border px-3 py-2 transition-colors ${
                isActive
                  ? "border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_20px_rgba(34,211,238,0.12)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]/60"
              }`}
            >
              {isActive && (
                <motion.div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/15 to-transparent"
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
                />
              )}
              <div className="relative flex items-baseline justify-between gap-2">
                <span className="font-medium text-slate-100">{L.label}</span>
                <span className="text-xs text-slate-500">{L.desc}</span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
