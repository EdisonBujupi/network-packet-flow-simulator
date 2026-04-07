/**
 * Canvas-oriented simulation: deterministic updates, no async sleeps.
 * Single source of truth for packet positions + FSM phase.
 */
import { segmentPayload } from "./types";
import type { SimulationConfig, SimulationResult } from "./types";

export const SENDER_IP = "192.168.1.10";
export const RECEIVER_IP = "203.0.113.50";

export type SimPhase = "idle" | "running" | "paused" | "done";

export type LayerMode = "physical" | "tcp" | "ip";

export type TimelineKind = "sent" | "lost" | "ack" | "retransmit" | "info";

export interface TimelineEntry {
  id: number;
  t: number;
  kind: TimelineKind;
  text: string;
}

export interface VisualPacket {
  id: string;
  kind: "data" | "ack";
  /** TCP sequence (data) or cumulative ACK number (ack) */
  seq: number;
  ack: number;
  segmentIndex: number;
  forward: boolean;
  /** Forward: 0..2 edges Client→Server; Back: 0..2 Server→Client */
  hopIndex: number;
  progress: number;
  /** Vertical lane for parallel packets */
  lane: number;
  lost: boolean;
  /** 1 = visible, 0 = remove */
  fade: number;
  retransmitGen: number;
  srcIp: string;
  dstIp: string;
}

export interface CanvasSimSnapshot {
  phase: SimPhase;
  time: number;
  packets: VisualPacket[];
  timeline: TimelineEntry[];
  layerMode: LayerMode;
  deliveredPreview: string;
  statusLine: string;
}

const EDGE_HOPS = 3;
const MAX_PARALLEL = 4;
/** Seconds per hop at speed=1 (scaled by speed slider) */
const BASE_HOP_SEC = 0.85;

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export class CanvasSimulation {
  phase: SimPhase = "idle";
  time = 0;
  packets: VisualPacket[] = [];
  timeline: TimelineEntry[] = [];
  layerMode: LayerMode = "physical";

  private rng: () => number = mulberry32(1);
  private config: SimulationConfig;
  private timelineId = 0;

  private payloads: string[] = [];
  private baseSeq = 1000;

  /** TCP: segments waiting to be injected at client */
  private sendQueue: { index: number; seq: number; pl: string }[] = [];
  /** TCP: number of segments not yet ACKed at client (sliding window) */
  private inFlight = 0;
  private readonly windowSize = 3;

  private delivered = "";
  private crashed = false;
  private result: SimulationResult | null = null;

  /** TCP: segment fully ACKed at client */
  private tcpAcked: boolean[] = [];

  /** UDP: per-segment receive buffer (ordered reassembly) */
  private udpGot: (string | undefined)[] = [];

  /** Pending retransmit after loss (TCP). `fromDataLoss` → increment inFlight when spawned. */
  private retransmitAt: {
    seg: { index: number; seq: number; pl: string };
    at: number;
    fromDataLoss: boolean;
  }[] = [];

  constructor(cfg: SimulationConfig) {
    this.config = { ...cfg };
    this.resetInternals();
  }

  setConfig(partial: Partial<SimulationConfig>): void {
    if (this.phase === "running") return;
    this.config = { ...this.config, ...partial };
    this.resetInternals();
  }

  setLayerMode(m: LayerMode): void {
    this.layerMode = m;
  }

  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  getResult(): SimulationResult | null {
    return this.result;
  }

  snapshot(): CanvasSimSnapshot {
    return {
      phase: this.phase,
      time: this.time,
      packets: this.packets,
      timeline: this.timeline,
      layerMode: this.layerMode,
      deliveredPreview: this.delivered,
      statusLine: this.statusLine(),
    };
  }

  private statusLine(): string {
    if (this.phase === "idle") return "Ready";
    if (this.phase === "paused") return "Paused";
    if (this.phase === "done" && this.result) {
      return this.result.success
        ? `Done — delivered "${this.result.deliveredMessage}"`
        : `Stopped — got "${this.result.deliveredMessage}"`;
    }
    return this.config.useTcp ? "TCP — reliability + ACKs" : "No-TCP / UDP-like — best effort";
  }

  private resetInternals(): void {
    this.time = 0;
    this.packets = [];
    this.timeline = [];
    this.timelineId = 0;
    this.delivered = "";
    this.crashed = false;
    this.result = null;
    this.inFlight = 0;
    this.retransmitAt = [];
    this.tcpAcked = [];
    this.rng = mulberry32(
      this.config.message.length * 7919 + Math.floor(this.config.packetLoss * 10000),
    );

    const msg = this.config.message || "";
    let chunks = segmentPayload(msg, 3);
    if (!this.config.useTcp && this.config.arpanetMode) {
      chunks = [msg.slice(0, 2) || msg.slice(0, 1) || ""];
      this.log("info", "ARPANET-style: only partial payload is transmitted.");
    }

    this.payloads = chunks;
    this.baseSeq = 1000;
    this.tcpAcked = chunks.map(() => false);
    this.udpGot = chunks.map(() => undefined);

    this.sendQueue = chunks.map((pl, i) => ({
      index: i,
      seq: this.baseSeq + i * 100,
      pl,
    }));
  }

  reset(): void {
    this.phase = "idle";
    this.resetInternals();
  }

  start(): void {
    if (this.phase === "running") return;
    this.resetInternals();
    this.phase = "running";
    this.log("info", `Start — ${this.payloads.length} segment(s), loss ${Math.round(this.config.packetLoss * 100)}%`);

    if (!this.config.useTcp) {
      for (let i = 0; i < this.sendQueue.length; i++) {
        const s = this.sendQueue[i]!;
        this.spawnData(s, i % MAX_PARALLEL, 0);
      }
      this.sendQueue = [];
      return;
    }

    /** TCP: fill window */
    this.pumpTcpSends();
  }

  pause(): void {
    if (this.phase !== "running") return;
    this.phase = "paused";
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.phase = "running";
  }

  private pumpTcpSends(): void {
    while (
      this.inFlight < this.windowSize &&
      this.sendQueue.length > 0 &&
      this.phase === "running"
    ) {
      const s = this.sendQueue.shift()!;
      const lane = s.index % MAX_PARALLEL;
      this.spawnData(s, lane, 0);
      this.inFlight += 1;
    }
  }

  private spawnData(
    s: { index: number; seq: number; pl: string },
    lane: number,
    gen: number,
  ): void {
    this.log("sent", `DATA seq=${s.seq} seg#${s.index + 1} "${s.pl}"`);
    this.packets.push({
      id: nextId("d"),
      kind: "data",
      seq: s.seq,
      ack: 0,
      segmentIndex: s.index,
      forward: true,
      hopIndex: 0,
      progress: 0,
      lane,
      lost: false,
      fade: 1,
      retransmitGen: gen,
      srcIp: SENDER_IP,
      dstIp: RECEIVER_IP,
    });
  }

  private spawnAck(ack: number, segmentIndex: number, lane: number): void {
    this.log("ack", `ACK ${ack} (for seg#${segmentIndex + 1})`);
    this.packets.push({
      id: nextId("a"),
      kind: "ack",
      seq: 0,
      ack,
      segmentIndex,
      forward: false,
      hopIndex: 0,
      progress: 0,
      lane,
      lost: false,
      fade: 1,
      retransmitGen: 0,
      srcIp: RECEIVER_IP,
      dstIp: SENDER_IP,
    });
  }

  private log(kind: TimelineKind, text: string): void {
    this.timelineId += 1;
    this.timeline.push({ id: this.timelineId, t: this.time, kind, text });
    if (this.timeline.length > 200) this.timeline.shift();
  }

  /** Advance simulation by dt seconds */
  tick(dt: number): void {
    if (this.phase !== "running") return;

    const speed = Math.max(0.1, this.config.speedFactor);
    const hopSec = BASE_HOP_SEC / speed;
    this.time += dt;

    /** Retransmit timers */
    const rt = this.retransmitAt.filter((r) => r.at <= this.time);
    this.retransmitAt = this.retransmitAt.filter((r) => r.at > this.time);
    for (const r of rt) {
      if (this.config.useTcp && !this.config.arpanetMode) {
        this.log("retransmit", `Retransmit seq=${r.seg.seq} seg#${r.seg.index + 1}`);
        this.spawnData(r.seg, r.seg.index % MAX_PARALLEL, r.seg.seq + 1);
        if (r.fromDataLoss) this.inFlight += 1;
      }
    }

    const step = dt / hopSec;

    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i]!;
      if (p.lost) {
        p.fade -= dt * 2.2;
        if (p.fade <= 0) this.packets.splice(i, 1);
        continue;
      }

      p.progress += step;
      while (p.progress >= 1 && !p.lost) {
        p.progress -= 1;
        const lose =
          this.config.packetLoss > 0 && this.rng() < this.config.packetLoss;
        if (lose) {
          this.onHopLoss(p);
          if (this.phase !== "running") return;
          break;
        }
        p.hopIndex += 1;
        if (p.kind === "data" && p.forward) {
          if (p.hopIndex >= EDGE_HOPS) {
            this.onDataArrived(p);
            this.packets.splice(i, 1);
            if (this.phase !== "running") return;
            break;
          }
        } else if (p.kind === "ack" && !p.forward) {
          if (p.hopIndex >= EDGE_HOPS) {
            this.onAckArrived(p);
            this.packets.splice(i, 1);
            if (this.phase !== "running") return;
            break;
          }
        }
      }
    }

    /** UDP mode completion: no packets left and queue empty */
    if (!this.config.useTcp && this.packets.length === 0 && this.phase === "running") {
      this.finishUdp();
    }
  }

  private onHopLoss(p: VisualPacket): void {
    p.lost = true;
    this.log("lost", `${p.kind === "data" ? "DATA" : "ACK"} lost (seq ${p.kind === "data" ? p.seq : p.ack})`);

    if (p.kind === "data" && this.config.useTcp) {
      if (this.config.arpanetMode) {
        this.crashed = true;
        this.delivered = this.payloads.slice(0, p.segmentIndex).join("");
        this.log("info", "ARPANET crash — no recovery.");
        this.finish(false);
        return;
      }
      /** Retransmit after delay */
      const seg = this.payloads[p.segmentIndex] !== undefined
        ? {
            index: p.segmentIndex,
            seq: p.seq,
            pl: this.payloads[p.segmentIndex]!,
          }
        : null;
      if (seg) {
        this.retransmitAt.push({
          seg,
          at: this.time + 0.55 / Math.max(0.2, this.config.speedFactor),
          fromDataLoss: true,
        });
      }
      this.inFlight = Math.max(0, this.inFlight - 1);
    }

    if (p.kind === "ack" && this.config.useTcp) {
      /** ACK lost — TCP will eventually retransmit data (simplified: re-queue segment) */
      const seg = {
        index: p.segmentIndex,
        seq: this.baseSeq + p.segmentIndex * 100,
        pl: this.payloads[p.segmentIndex]!,
      };
      this.retransmitAt.push({
        seg,
        at: this.time + 0.45 / Math.max(0.2, this.config.speedFactor),
        fromDataLoss: false,
      });
    }
  }

  private onDataArrived(p: VisualPacket): void {
    if (!this.config.useTcp) {
      const pl = this.payloads[p.segmentIndex] ?? "";
      this.udpGot[p.segmentIndex] = pl;
      this.delivered = this.payloads
        .map((_, i) => this.udpGot[i] ?? "")
        .join("");
      return;
    }

    const ack = p.seq + (this.payloads[p.segmentIndex]?.length ?? 0);
    this.spawnAck(ack, p.segmentIndex, p.lane);
  }

  private onAckArrived(p: VisualPacket): void {
    if (!this.config.useTcp) return;
    this.log("info", `ACK ${p.ack} received at client`);
    this.tcpAcked[p.segmentIndex] = true;
    this.delivered = this.payloads
      .map((pl, i) => (this.tcpAcked[i] ? pl : ""))
      .join("");
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.pumpTcpSends();

    const allAcked =
      this.tcpAcked.length > 0 && this.tcpAcked.every(Boolean);
    if (allAcked && this.sendQueue.length === 0 && this.inFlight === 0) {
      this.finish(true);
    }
  }

  private finishUdp(): void {
    const full = this.config.message ?? "";
    const ok = this.delivered === full;
    this.finish(ok);
  }

  private finish(success: boolean): void {
    this.phase = "done";
    const msg = this.config.message ?? "";
    const deliveredOk = this.delivered === msg;
    this.result = {
      deliveredMessage: this.delivered,
      crashed: this.crashed,
      success: success && !this.crashed && deliveredOk,
    };
    this.log("info", success && deliveredOk ? "Complete." : "Incomplete.");
  }
}
