import { segmentPayload } from "./types";
import type { SimulationConfig, SimulationResult } from "./types";

export const SENDER_IP = "192.168.1.10";
export const RECEIVER_IP = "203.0.113.50";

export type SimPhase = "idle" | "running" | "paused" | "done";
export type LayerMode = "physical" | "ip" | "tcp" | "application";
export type PacketLifecycle =
  | "created"
  | "in_transit"
  | "lost"
  | "retransmitting"
  | "acknowledged"
  | "delivered";
export type TimelineKind =
  | "sent"
  | "lost"
  | "ack"
  | "retransmit"
  | "dup_ack"
  | "protocol"
  | "pause"
  | "info";

export interface TimelineEntry {
  id: number;
  t: number;
  kind: TimelineKind;
  text: string;
  packetId?: string;
  seq?: number;
  ack?: number;
  path?: string;
}

export interface VisualPacket {
  id: string;
  kind: "data" | "ack";
  seq: number;
  ack: number;
  seqStart: number;
  seqEnd: number;
  segmentIndex: number;
  forward: boolean;
  hopIndex: number;
  progress: number;
  lane: number;
  lost: boolean;
  fade: number;
  retransmitGen: number;
  srcIp: string;
  dstIp: string;
  lifecycle: PacketLifecycle;
}

export interface SimMetrics {
  now: number;
  inFlight: number;
  cwnd: number;
  ssthresh: number;
  dupAckCount: number;
  totalSent: number;
  totalLost: number;
  totalRetransmit: number;
  totalAcked: number;
  lossRate: number;
  avgRttMs: number;
  throughputBps: number;
  goodputBps: number;
}

export interface RuntimeControls {
  timeScale: number;
  stepMode: boolean;
  pauseOnLoss: boolean;
  pauseOnRetransmit: boolean;
}

export interface CanvasSimSnapshot {
  phase: SimPhase;
  time: number;
  packets: VisualPacket[];
  timeline: TimelineEntry[];
  layerMode: LayerMode;
  deliveredPreview: string;
  statusLine: string;
  selectedPacketId: string | null;
  metrics: SimMetrics;
  runtime: RuntimeControls;
  protocolState: {
    dnsDone: boolean;
    tlsDone: boolean;
    httpRequestSent: boolean;
    httpResponseReceived: boolean;
    dnsCached: boolean;
    dnsTtlSec: number;
  };
}

const EDGE_HOPS = 3;
const MAX_PARALLEL = 4;
const BASE_HOP_SEC = 0.85;
const BASE_TCP_WINDOW = 3;

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

interface SegmentSpec {
  index: number;
  seq: number;
  pl: string;
  sentAt: number;
  retransmits: number;
}

interface Scheduled {
  at: number;
  type:
    | "dns_query"
    | "dns_answer"
    | "tls_client_hello"
    | "tls_server_hello"
    | "tls_keys_ready"
    | "http_request"
    | "http_response";
}

export class CanvasSimulation {
  phase: SimPhase = "idle";
  time = 0;
  packets: VisualPacket[] = [];
  timeline: TimelineEntry[] = [];
  layerMode: LayerMode = "physical";
  selectedPacketId: string | null = null;

  private rng: () => number = mulberry32(1);
  private config: SimulationConfig;
  private timelineId = 0;

  private runtime: RuntimeControls = {
    timeScale: 1,
    stepMode: false,
    pauseOnLoss: false,
    pauseOnRetransmit: false,
  };
  private stepBudgetSec = 0;

  private payloads: string[] = [];
  private baseSeq = 1000;
  private sendQueue: SegmentSpec[] = [];
  private inFlight = 0;
  private delivered = "";
  private crashed = false;
  private result: SimulationResult | null = null;

  private tcpAcked: boolean[] = [];
  private udpGot: (string | undefined)[] = [];
  private sentAtBySegment = new Map<number, number>();
  private retransmitAt: {
    seg: SegmentSpec;
    at: number;
    fromDataLoss: boolean;
    fast: boolean;
  }[] = [];
  private duplicateAckCounter = 0;
  private lastAckNumber = this.baseSeq;
  private cwnd = 1;
  private ssthresh = 8;
  private avgRttMs = 0;
  private rttCount = 0;

  private totalSent = 0;
  private totalLost = 0;
  private totalRetransmit = 0;
  private totalAcked = 0;
  private totalBytesSent = 0;
  private totalBytesDelivered = 0;

  private protocol = {
    dnsDone: false,
    tlsDone: false,
    httpRequestSent: false,
    httpResponseReceived: false,
    dnsCached: false,
    dnsTtlSec: 18,
  };
  private scheduled: Scheduled[] = [];
  private appReady = false;

  constructor(cfg: SimulationConfig) {
    this.config = { ...cfg };
    this.resetInternals();
  }

  setConfig(partial: Partial<SimulationConfig>): void {
    if (this.phase === "running") return;
    this.config = { ...this.config, ...partial };
    this.resetInternals();
  }

  configureRuntime(partial: Partial<RuntimeControls>): void {
    this.runtime = { ...this.runtime, ...partial };
  }

  getRuntime(): RuntimeControls {
    return { ...this.runtime };
  }

  requestStep(seconds = 0.28): void {
    this.stepBudgetSec += Math.max(0.05, seconds);
    if (this.phase === "paused") this.phase = "running";
  }

  setLayerMode(m: LayerMode): void {
    this.layerMode = m;
  }

  setSelectedPacket(id: string | null): void {
    this.selectedPacketId = id;
  }

  getConfig(): SimulationConfig {
    return { ...this.config };
  }

  getResult(): SimulationResult | null {
    return this.result;
  }

  snapshot(): CanvasSimSnapshot {
    const elapsed = Math.max(this.time, 0.001);
    const sentOrLost = Math.max(1, this.totalSent + this.totalLost);
    return {
      phase: this.phase,
      time: this.time,
      packets: this.packets,
      timeline: this.timeline,
      layerMode: this.layerMode,
      deliveredPreview: this.delivered,
      statusLine: this.statusLine(),
      selectedPacketId: this.selectedPacketId,
      metrics: {
        now: this.time,
        inFlight: this.inFlight,
        cwnd: this.cwnd,
        ssthresh: this.ssthresh,
        dupAckCount: this.duplicateAckCounter,
        totalSent: this.totalSent,
        totalLost: this.totalLost,
        totalRetransmit: this.totalRetransmit,
        totalAcked: this.totalAcked,
        lossRate: this.totalLost / sentOrLost,
        avgRttMs: this.avgRttMs,
        throughputBps: this.totalBytesSent / elapsed,
        goodputBps: this.totalBytesDelivered / elapsed,
      },
      runtime: { ...this.runtime },
      protocolState: { ...this.protocol },
    };
  }

  private statusLine(): string {
    if (this.phase === "idle") return "Ready";
    if (this.phase === "paused") return "Paused";
    if (this.phase === "done" && this.result) {
      return this.result.success
        ? `Done: delivered "${this.result.deliveredMessage}"`
        : `Stopped: delivered "${this.result.deliveredMessage}"`;
    }
    return this.config.useTcp
      ? `TCP cwnd=${this.cwnd.toFixed(2)} ssthresh=${this.ssthresh.toFixed(2)}`
      : "No TCP mode (ARPANET-style best effort)";
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
    this.udpGot = [];
    this.sentAtBySegment.clear();
    this.duplicateAckCounter = 0;
    this.lastAckNumber = this.baseSeq;
    this.cwnd = 1;
    this.ssthresh = 8;
    this.avgRttMs = 0;
    this.rttCount = 0;
    this.totalSent = 0;
    this.totalLost = 0;
    this.totalRetransmit = 0;
    this.totalAcked = 0;
    this.totalBytesSent = 0;
    this.totalBytesDelivered = 0;
    this.protocol = {
      dnsDone: false,
      tlsDone: false,
      httpRequestSent: false,
      httpResponseReceived: false,
      dnsCached: false,
      dnsTtlSec: 18,
    };
    this.scheduled = [];
    this.appReady = false;
    this.selectedPacketId = null;

    this.rng = mulberry32(
      this.config.message.length * 7919 + Math.floor(this.config.packetLoss * 10000),
    );

    const msg = this.config.message || "";
    let chunks = segmentPayload(msg, 3);
    if (!this.config.useTcp && this.config.arpanetMode) {
      chunks = [msg.slice(0, 2) || msg.slice(0, 1) || ""];
      this.log("protocol", "ARPANET: partial payload only (e.g., LO).");
    }

    this.payloads = chunks;
    this.baseSeq = 1000;
    this.tcpAcked = chunks.map(() => false);
    this.udpGot = chunks.map(() => undefined);
    this.sendQueue = chunks.map((pl, i) => ({
      index: i,
      seq: this.baseSeq + i * 100,
      pl,
      sentAt: 0,
      retransmits: 0,
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
    this.log(
      "info",
      `Start ${this.payloads.length} segment(s), loss ${Math.round(this.config.packetLoss * 100)}%`,
    );
    this.scheduleProtocolPrelude();
  }

  pause(): void {
    if (this.phase !== "running") return;
    this.phase = "paused";
  }

  resume(): void {
    if (this.phase !== "paused") return;
    this.phase = "running";
  }

  private scheduleProtocolPrelude(): void {
    const t0 = this.time;
    const d = 0.28 / Math.max(0.2, this.runtime.timeScale);
    this.scheduled.push(
      { at: t0 + d, type: "dns_query" },
      { at: t0 + d * 2, type: "dns_answer" },
      { at: t0 + d * 3, type: "tls_client_hello" },
      { at: t0 + d * 4, type: "tls_server_hello" },
      { at: t0 + d * 5, type: "tls_keys_ready" },
      { at: t0 + d * 6, type: "http_request" },
    );
  }

  private processScheduled(): void {
    const ready = this.scheduled.filter((s) => s.at <= this.time);
    this.scheduled = this.scheduled.filter((s) => s.at > this.time);
    for (const s of ready) {
      switch (s.type) {
        case "dns_query":
          this.log("protocol", "DNS query: example.org A?");
          break;
        case "dns_answer":
          this.protocol.dnsDone = true;
          this.protocol.dnsCached = true;
          this.log(
            "protocol",
            `DNS answer cached (TTL ${this.protocol.dnsTtlSec}s): ${RECEIVER_IP}`,
          );
          break;
        case "tls_client_hello":
          this.log("protocol", "TLS: ClientHello");
          break;
        case "tls_server_hello":
          this.log("protocol", "TLS: ServerHello + cert");
          break;
        case "tls_keys_ready":
          this.protocol.tlsDone = true;
          this.log("protocol", "TLS: keys established (encrypted app data)");
          break;
        case "http_request":
          this.protocol.httpRequestSent = true;
          this.appReady = true;
          this.log("protocol", "HTTP request: GET /login");
          this.launchTransportFlow();
          break;
        case "http_response":
          this.protocol.httpResponseReceived = true;
          this.log("protocol", "HTTP response: 200 OK");
          break;
      }
    }
  }

  private effectiveWindow(): number {
    if (!this.config.useTcp) return this.sendQueue.length;
    return Math.max(1, Math.min(BASE_TCP_WINDOW, Math.floor(this.cwnd)));
  }

  private pumpTcpSends(): void {
    const wnd = this.effectiveWindow();
    while (this.inFlight < wnd && this.sendQueue.length > 0 && this.phase === "running") {
      const s = this.sendQueue.shift()!;
      s.sentAt = this.time;
      this.sentAtBySegment.set(s.index, s.sentAt);
      const lane = s.index % MAX_PARALLEL;
      this.spawnData(s, lane, s.retransmits);
      this.inFlight += 1;
    }
  }

  private launchTransportFlow(): void {
    if (!this.config.useTcp) {
      for (let i = 0; i < this.sendQueue.length; i++) {
        const s = this.sendQueue[i]!;
        s.sentAt = this.time;
        this.spawnData(s, i % MAX_PARALLEL, s.retransmits);
      }
      this.sendQueue = [];
      return;
    }
    this.pumpTcpSends();
  }

  private spawnData(s: SegmentSpec, lane: number, gen: number): void {
    const packet: VisualPacket = {
      id: nextId("d"),
      kind: "data",
      seq: s.seq,
      ack: 0,
      seqStart: s.seq,
      seqEnd: s.seq + s.pl.length,
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
      lifecycle: gen > 0 ? "retransmitting" : "created",
    };
    this.packets.push(packet);
    this.totalSent += 1;
    this.totalBytesSent += s.pl.length;
    this.log("sent", `DATA seq=${s.seq}..${s.seq + s.pl.length} seg#${s.index + 1}`, {
      packetId: packet.id,
      seq: s.seq,
      ack: 0,
      path: "CLIENT->R1->R2->SERVER",
    });
  }

  private spawnAck(ack: number, segmentIndex: number, lane: number): void {
    const packet: VisualPacket = {
      id: nextId("a"),
      kind: "ack",
      seq: 0,
      ack,
      seqStart: ack,
      seqEnd: ack,
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
      lifecycle: "created",
    };
    this.packets.push(packet);
    this.log("ack", `ACK ${ack} for seg#${segmentIndex + 1}`, {
      packetId: packet.id,
      seq: 0,
      ack,
      path: "SERVER->R2->R1->CLIENT",
    });
  }

  private log(kind: TimelineKind, text: string, extra?: Omit<TimelineEntry, "id" | "t" | "kind" | "text">): void {
    this.timelineId += 1;
    this.timeline.push({
      id: this.timelineId,
      t: this.time,
      kind,
      text,
      ...extra,
    });
    if (this.timeline.length > 350) this.timeline.shift();
  }

  tick(dt: number): void {
    if (this.phase !== "running") return;

    const scaledDt = dt * Math.max(0.1, this.runtime.timeScale);
    if (this.runtime.stepMode) {
      if (this.stepBudgetSec <= 0) {
        this.phase = "paused";
        return;
      }
      this.stepBudgetSec -= scaledDt;
    }

    const hopSec = BASE_HOP_SEC / Math.max(0.1, this.config.speedFactor);
    this.time += scaledDt;

    this.processScheduled();

    const due = this.retransmitAt.filter((r) => r.at <= this.time);
    this.retransmitAt = this.retransmitAt.filter((r) => r.at > this.time);
    for (const r of due) {
      if (!this.config.useTcp || this.config.arpanetMode) continue;
      if (this.tcpAcked[r.seg.index]) continue;
      this.totalRetransmit += 1;
      if (this.runtime.pauseOnRetransmit) {
        this.log("pause", "Paused on retransmit event.");
        this.phase = "paused";
      }
      r.seg.retransmits += 1;
      r.seg.sentAt = this.time;
      this.sentAtBySegment.set(r.seg.index, this.time);
      this.spawnData(r.seg, r.seg.index % MAX_PARALLEL, r.seg.retransmits);
      if (r.fromDataLoss || r.fast) this.inFlight += 1;
      if (this.phase !== "running") return;
    }

    const step = scaledDt / hopSec;
    for (let i = this.packets.length - 1; i >= 0; i--) {
      const p = this.packets[i]!;
      if (p.lost) {
        p.fade -= scaledDt * 2.2;
        if (p.fade <= 0) this.packets.splice(i, 1);
        continue;
      }
      p.lifecycle = "in_transit";
      p.progress += step;
      while (p.progress >= 1 && !p.lost) {
        p.progress -= 1;
        const lose = this.config.packetLoss > 0 && this.rng() < this.config.packetLoss;
        if (lose) {
          this.onHopLoss(p);
          if (this.phase !== "running") return;
          break;
        }
        p.hopIndex += 1;
        if (p.kind === "data" && p.forward && p.hopIndex >= EDGE_HOPS) {
          this.onDataArrived(p);
          this.packets.splice(i, 1);
          if (this.phase !== "running") return;
          break;
        }
        if (p.kind === "ack" && !p.forward && p.hopIndex >= EDGE_HOPS) {
          this.onAckArrived(p);
          this.packets.splice(i, 1);
          if (this.phase !== "running") return;
          break;
        }
      }
    }

    if (!this.config.useTcp && this.appReady && this.packets.length === 0 && this.phase === "running") {
      this.finishUdp();
    }
  }

  private onHopLoss(p: VisualPacket): void {
    p.lost = true;
    p.lifecycle = "lost";
    this.totalLost += 1;
    this.log(
      "lost",
      `${p.kind.toUpperCase()} lost (${p.kind === "data" ? `seq=${p.seq}` : `ack=${p.ack}`})`,
      { packetId: p.id, seq: p.seq, ack: p.ack },
    );
    if (this.runtime.pauseOnLoss) {
      this.log("pause", "Paused on packet loss.");
      this.phase = "paused";
    }

    if (p.kind === "data" && this.config.useTcp) {
      this.ssthresh = Math.max(2, this.cwnd / 2);
      this.cwnd = 1;
      if (this.config.arpanetMode) {
        this.crashed = true;
        this.delivered = this.payloads.slice(0, p.segmentIndex).join("");
        this.log("info", "ARPANET crash: no retransmission safety.");
        this.finish(false);
        return;
      }
      const seg = this.payloads[p.segmentIndex]
        ? {
            index: p.segmentIndex,
            seq: this.baseSeq + p.segmentIndex * 100,
            pl: this.payloads[p.segmentIndex]!,
            sentAt: this.time,
            retransmits: 0,
          }
        : null;
      if (seg) {
        this.retransmitAt.push({
          seg,
          at: this.time + 0.55 / Math.max(0.2, this.runtime.timeScale),
          fromDataLoss: true,
          fast: false,
        });
      }
      this.inFlight = Math.max(0, this.inFlight - 1);
    }

    if (p.kind === "ack" && this.config.useTcp) {
      const seg = {
        index: p.segmentIndex,
        seq: this.baseSeq + p.segmentIndex * 100,
        pl: this.payloads[p.segmentIndex] ?? "",
        sentAt: this.time,
        retransmits: 0,
      };
      this.retransmitAt.push({
        seg,
        at: this.time + 0.45 / Math.max(0.2, this.runtime.timeScale),
        fromDataLoss: false,
        fast: false,
      });
    }
  }

  private onDataArrived(p: VisualPacket): void {
    p.lifecycle = "delivered";
    if (!this.config.useTcp) {
      const pl = this.payloads[p.segmentIndex] ?? "";
      this.udpGot[p.segmentIndex] = pl;
      this.delivered = this.payloads.map((_, i) => this.udpGot[i] ?? "").join("");
      this.totalBytesDelivered = this.delivered.length;
      return;
    }
    const ack = p.seq + (this.payloads[p.segmentIndex]?.length ?? 0);
    this.spawnAck(ack, p.segmentIndex, p.lane);
  }

  private onAckArrived(p: VisualPacket): void {
    if (!this.config.useTcp) return;
    p.lifecycle = "acknowledged";
    const isDup = p.ack <= this.lastAckNumber;
    if (isDup) {
      this.duplicateAckCounter += 1;
      this.log("dup_ack", `Duplicate ACK ${p.ack} (${this.duplicateAckCounter})`, {
        packetId: p.id,
        ack: p.ack,
      });
      if (this.duplicateAckCounter >= 3) {
        const firstUnacked = this.tcpAcked.findIndex((x) => !x);
        if (firstUnacked >= 0) {
          const seg: SegmentSpec = {
            index: firstUnacked,
            seq: this.baseSeq + firstUnacked * 100,
            pl: this.payloads[firstUnacked] ?? "",
            sentAt: this.time,
            retransmits: 1,
          };
          this.retransmitAt.push({
            seg,
            at: this.time + 0.01,
            fromDataLoss: true,
            fast: true,
          });
          this.totalRetransmit += 1;
          this.log("retransmit", `Fast retransmit on 3 dupACKs seq=${seg.seq}`, {
            seq: seg.seq,
          });
        }
        this.duplicateAckCounter = 0;
      }
      return;
    }

    this.lastAckNumber = p.ack;
    this.duplicateAckCounter = 0;
    this.log("info", `ACK ${p.ack} received at client`, { ack: p.ack, packetId: p.id });
    this.tcpAcked[p.segmentIndex] = true;
    this.totalAcked += 1;
    const sentAt = this.sentAtBySegment.get(p.segmentIndex);
    if (sentAt !== undefined) {
      const sample = (this.time - sentAt) * 1000;
      this.rttCount += 1;
      this.avgRttMs = this.avgRttMs + (sample - this.avgRttMs) / this.rttCount;
    }

    this.delivered = this.payloads.map((pl, i) => (this.tcpAcked[i] ? pl : "")).join("");
    this.totalBytesDelivered = this.delivered.length;
    this.inFlight = Math.max(0, this.inFlight - 1);

    if (this.cwnd < this.ssthresh) this.cwnd += 1;
    else this.cwnd += 1 / Math.max(1, this.cwnd);

    this.pumpTcpSends();
    const allAcked = this.tcpAcked.length > 0 && this.tcpAcked.every(Boolean);
    if (allAcked && this.sendQueue.length === 0 && this.inFlight === 0) {
      if (!this.protocol.httpResponseReceived) {
        this.scheduled.push({ at: this.time + 0.3, type: "http_response" });
      } else {
        this.finish(true);
      }
    }
    this.processScheduled();
    if (allAcked && this.protocol.httpResponseReceived && this.phase === "running") {
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
    this.log(
      "info",
      success && deliveredOk ? "Complete." : "Incomplete.",
      { path: "end-to-end" },
    );
  }
}
