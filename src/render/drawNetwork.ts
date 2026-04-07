import type { CanvasSimSnapshot, LayerMode, VisualPacket } from "../simulation/canvasSim";
import { RECEIVER_IP, SENDER_IP } from "../simulation/canvasSim";

export interface NodeLayout {
  x: number;
  y: number;
  label: string;
}

export function layoutNodes(w: number, h: number): NodeLayout[] {
  const y = h * 0.5;
  return [
    { x: w * 0.07, y, label: "CLIENT" },
    { x: w * 0.36, y, label: "ROUTER 1" },
    { x: w * 0.64, y, label: "ROUTER 2" },
    { x: w * 0.93, y, label: "SERVER" },
  ];
}

function shortenIp(ip: string): string {
  const p = ip.split(".");
  if (p.length === 4) return `${p[0]}.${p[1]}.${p[2]}.x`;
  return ip;
}

function packetLabel(p: VisualPacket, mode: LayerMode): string {
  if (p.lost) return "LOST";
  if (mode === "physical") {
    return p.kind === "data" ? `D${p.segmentIndex + 1}` : `ACK${p.ack}`;
  }
  if (mode === "tcp") {
    return p.kind === "data" ? `SEQ ${p.seq}` : `ACK ${p.ack}`;
  }
  return p.kind === "data"
    ? `${shortenIp(SENDER_IP)}→${shortenIp(RECEIVER_IP)}`
    : `${shortenIp(RECEIVER_IP)}→${shortenIp(SENDER_IP)}`;
}

function edgeEndpoints(
  p: VisualPacket,
  nodes: NodeLayout[],
): { x0: number; y0: number; x1: number; y1: number } {
  const lane = (p.lane - 1) * 14;
  if (p.kind === "data" && p.forward) {
    const a = nodes[p.hopIndex]!;
    const b = nodes[p.hopIndex + 1]!;
    return { x0: a.x, y0: a.y + lane, x1: b.x, y1: b.y + lane };
  }
  const from = 3 - p.hopIndex;
  const to = 2 - p.hopIndex;
  const a = nodes[from]!;
  const b = nodes[to]!;
  return { x0: a.x, y0: a.y + lane, x1: b.x, y1: b.y + lane };
}

function packetPosition(p: VisualPacket, nodes: NodeLayout[]): { x: number; y: number } {
  const { x0, y0, x1, y1 } = edgeEndpoints(p, nodes);
  const t = Math.min(1, Math.max(0, p.progress));
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t };
}

export function drawNetwork(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  snap: CanvasSimSnapshot,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#070b14";
  ctx.fillRect(0, 0, w, h);

  const nodes = layoutNodes(w, h);

  /** Links */
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 3;
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i]!;
    const b = nodes[i + 1]!;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  /** Direction: forward path (client → server) */
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(34,211,238,0.2)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nodes[0]!.x, nodes[0]!.y - 36);
  for (let i = 1; i < nodes.length; i++) {
    ctx.lineTo(nodes[i]!.x, nodes[i]!.y - 36);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  /** Nodes */
  for (const n of nodes) {
    ctx.fillStyle = "#0f172a";
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(n.x, n.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "600 11px DM Sans, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n.label, n.x, n.y);
  }

  /** Packets */
  for (const p of snap.packets) {
    const pos = packetPosition(p, nodes);
    const alpha = p.lost ? p.fade : 1;
    ctx.globalAlpha = alpha;

    const wBox = 76;
    const hBox = 28;
    const x = pos.x - wBox / 2;
    const y = pos.y - hBox / 2;

    if (p.lost) {
      ctx.fillStyle = "rgba(248,113,113,0.35)";
      ctx.strokeStyle = "rgba(248,113,113,0.9)";
    } else if (p.kind === "ack") {
      ctx.fillStyle = "rgba(167,139,250,0.25)";
      ctx.strokeStyle = "rgba(167,139,250,0.95)";
    } else {
      ctx.fillStyle = "rgba(34,211,238,0.2)";
      ctx.strokeStyle = "rgba(34,211,238,0.95)";
    }

    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, wBox, hBox, 6);
    } else {
      ctx.rect(x, y, wBox, hBox);
    }
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = p.lost ? "#fecaca" : "#f1f5f9";
    ctx.font = "500 10px JetBrains Mono, ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const line1 = packetLabel(p, snap.layerMode);
    ctx.fillText(line1, pos.x, pos.y - 5);
    ctx.font = "400 9px JetBrains Mono, ui-monospace, monospace";
    ctx.fillStyle = "rgba(148,163,184,0.95)";
    if (snap.layerMode === "ip") {
      ctx.fillText(p.kind === "data" ? SENDER_IP : RECEIVER_IP, pos.x, pos.y + 8);
    } else {
      ctx.fillText(p.kind === "data" ? `→ ${RECEIVER_IP}` : `→ ${SENDER_IP}`, pos.x, pos.y + 8);
    }
    ctx.globalAlpha = 1;
  }

  /** Title strip */
  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.font = "400 11px DM Sans, system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(snap.statusLine, 12, 10);
}

/** Hit test for optional selection (canvas coords) */
export function hitTestPacket(
  snap: CanvasSimSnapshot,
  w: number,
  h: number,
  cx: number,
  cy: number,
): VisualPacket | null {
  const nodes = layoutNodes(w, h);
  for (let i = snap.packets.length - 1; i >= 0; i--) {
    const p = snap.packets[i]!;
    const pos = packetPosition(p, nodes);
    if (Math.hypot(pos.x - cx, pos.y - cy) < 40) return p;
  }
  return null;
}
