import { motion } from "framer-motion";
import type { SimEvent } from "../simulation/types";

/** Visual map: client — path A/B divergence — routers — server */
export function NetworkTopology({ event }: { event: SimEvent | null }) {
  const hop = event?.hop;
  const path = hop?.path;
  const lost = event?.type === "packet_lost";
  const rtx = event?.type === "retransmit";
  const activeHop = event?.type === "route_hop";

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/90 p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Network path
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Packets may take path A (cyan) or path B (violet). Loss and retransmits are highlighted in the status line.
      </p>
      <div className="relative h-44 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-gradient-to-b from-slate-900/80 to-slate-950">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="ga" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="gb" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          <motion.path
            d="M 40 100 C 100 40, 140 40, 200 80"
            fill="none"
            stroke="url(#ga)"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{
              opacity: activeHop && path === "pathA" ? [0.4, 1, 0.4] : path === "pathA" ? 0.95 : 0.22,
            }}
            transition={{ duration: activeHop && path === "pathA" ? 0.6 : 0.3 }}
          />
          <motion.path
            d="M 40 100 C 100 150, 140 150, 200 80"
            fill="none"
            stroke="url(#gb)"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{
              opacity: activeHop && path === "pathB" ? [0.4, 1, 0.4] : path === "pathB" ? 0.95 : 0.22,
            }}
            transition={{ duration: activeHop && path === "pathB" ? 0.6 : 0.3 }}
          />
          <line x1="200" y1="80" x2="300" y2="80" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
          <line x1="300" y1="80" x2="360" y2="80" stroke="#334155" strokeWidth="4" strokeLinecap="round" />

          <Node x={40} y={100} label="Client" sub="Sender" />
          <Node x={200} y={80} label="R1" sub="Router" />
          <Node x={300} y={80} label="R2" sub="Router" />
          <Node x={360} y={80} label="Server" sub="Receiver" />

          {activeHop && hop && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              key={`${hop.from}-${hop.to}-${path}`}
            >
              <circle
                cx={path === "pathB" ? 120 : 120}
                cy={path === "pathB" ? 120 : 60}
                r="6"
                fill={path === "pathB" ? "#a78bfa" : "#22d3ee"}
                opacity="0.9"
              />
            </motion.g>
          )}
        </svg>

        <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex gap-3 text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-400" /> Path A
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-violet-400" /> Path B
            </span>
          </div>
          <div className="font-mono text-slate-200">
            {lost && <span className="text-red-400">Lost segment · </span>}
            {rtx && <span className="text-amber-300">Retransmit · </span>}
            {hop ? (
              <span>
                {hop.from} → {hop.to} ({hop.path})
              </span>
            ) : (
              <span className="text-slate-500">Idle</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Node({
  x,
  y,
  label,
  sub,
}: {
  x: number;
  y: number;
  label: string;
  sub: string;
}) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle r="18" fill="#0f172a" stroke="#22d3ee" strokeWidth="2" />
      <text y="4" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="system-ui">
        {label}
      </text>
      <text y="28" textAnchor="middle" fill="#64748b" fontSize="7" fontFamily="system-ui">
        {sub}
      </text>
    </g>
  );
}
