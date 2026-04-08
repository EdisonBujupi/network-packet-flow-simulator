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
export type TimelineKind = "sent" | "lost" | "ack" | "retransmit" | "protocol" | "info";

export interface NarrativeStep {
  id:
    | "app_start"
    | "tcp_segment"
    | "ip_wrap"
    | "physical_send"
    | "router_forward"
    | "server_arrival"
    | "ack_return"
    | "complete"
    | "arpanet_fail"
    | "story_tcp_replay"
    | "tcp_loss_detected"
    | "tcp_retransmit_story"
    | "tcp_reorder_reassembly"
    | "dns_lookup"
    | "tls_handshake"
    | "http_exchange"
    | "cookie_state";
  layer: LayerMode;
  explanation: string;
  packetState: string;
  location: "CLIENT" | "ROUTER 1" | "ROUTER 2" | "SERVER";
}

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
  narrativeEnabled: boolean;
  autoPlay: boolean;
  advancedMode: boolean;
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
  currentNarrativeStep: NarrativeStep | null;
  layerBreakdown: Record<LayerMode, number>;
  focusedPacket: {
    id: string;
    origin: string;
    path: string;
    destination: string;
    layerStatus: string;
    lifecycle: PacketLifecycle;
    seqRange?: string;
    ack?: number;
    signalTimingMs?: number;
    signalError?: string;
    ipHop?: string;
    fragmentInfo?: string;
    appPurpose?: string;
  } | null;
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
    timeScale: 0.75,
    narrativeEnabled: true,
    autoPlay: true,
    advancedMode: false,
  };

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
  private retransmitAt: { seg: SegmentSpec; at: number; fromDataLoss: boolean }[] = [];
  private avgRttMs = 0;
  private rttCount = 0;

  private totalSent = 0;
  private totalLost = 0;
  private totalRetransmit = 0;
  private totalAcked = 0;
  private totalBytesSent = 0;
  private totalBytesDelivered = 0;
  private lossReasonBySegment = new Map<number, string>();

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

  private narrativeQueue: NarrativeStep[] = [];
  private currentNarrativeStep: NarrativeStep | null = null;
  private narrativeAutoUntil = 0;

  private storyMode = false;
  private storyStage: 0 | 1 | 2 = 0;
  private storyReplayAt: number | null = null;
  private storyReplayActive = false;
  private storyLossExplained = false;
  private storyRetransmitExplained = false;
  private storyReorderExplained = false;
  private layerStepCounts: Record<LayerMode, number> = {
    physical: 0,
    ip: 0,
    tcp: 0,
    application: 0,
  };

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

  setLayerMode(m: LayerMode): void {
    this.layerMode = m;
  }

  setSelectedPacket(id: string | null): void {
    this.selectedPacketId = id;
  }

  getResult(): SimulationResult | null {
    return this.result;
  }

  startStoryMode(): void {
    this.storyMode = true;
    this.storyStage = 1;
    this.storyReplayActive = false;
    this.phase = "idle";
    this.setConfig({ message: "LOGIN", useTcp: false, arpanetMode: true, packetLoss: 0.18 });
    this.start();
  }

  pauseAtNarrativeStep(step: NarrativeStep): void {
    this.layerMode = step.layer;
    this.currentNarrativeStep = step;
    this.layerStepCounts[step.layer] += 1;
    this.narrativeAutoUntil = this.time + 1.15 / Math.max(0.2, this.runtime.timeScale);
  }

  resumeFromNarrative(): void {
    if (!this.currentNarrativeStep) return;
    this.currentNarrativeStep = null;
    this.narrativeAutoUntil = 0;
    if (this.phase === "paused") this.phase = "running";
  }

  nextNarrativeStep(): void {
    if (this.currentNarrativeStep) {
      this.currentNarrativeStep = null;
      this.narrativeAutoUntil = 0;
    }
    const next = this.narrativeQueue.shift() ?? null;
    if (!next) {
      if (this.phase === "paused") this.phase = "running";
      return;
    }
    this.pauseAtNarrativeStep(next);
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
      currentNarrativeStep: this.currentNarrativeStep,
      metrics: {
        now: this.time,
        inFlight: this.inFlight,
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
      layerBreakdown: { ...this.layerStepCounts },
      focusedPacket: this.buildFocusedPacketContext(),
    };
  }

  private buildFocusedPacketContext(): CanvasSimSnapshot["focusedPacket"] {
    const p =
      (this.selectedPacketId && this.packets.find((x) => x.id === this.selectedPacketId)) ||
      this.packets[0] ||
      null;
    if (!p) return null;

    const path = p.kind === "data" ? "CLIENT->R1->R2->SERVER" : "SERVER->R2->R1->CLIENT";
    const hopNamesForward = ["CLIENT", "ROUTER 1", "ROUTER 2", "SERVER"] as const;
    const hopNamesBack = ["SERVER", "ROUTER 2", "ROUTER 1", "CLIENT"] as const;
    const hop = p.kind === "data" ? hopNamesForward[Math.min(3, p.hopIndex)] : hopNamesBack[Math.min(3, p.hopIndex)];
    const signalTimingMs = Math.round(
      ((p.hopIndex + p.progress) * BASE_HOP_SEC * 1000) / Math.max(0.1, this.config.speedFactor),
    );

    const fragmentInfo =
      this.payloads.length > 1
        ? `Segment ${p.segmentIndex + 1}/${this.payloads.length}`
        : "Single packet payload";
    const appPurpose = p.kind === "data"
      ? this.protocol.httpRequestSent
        ? "This packet requests the example.com homepage/login resource."
        : this.protocol.dnsDone
          ? "This packet carries encrypted setup/application data."
          : "This packet participates in service discovery and connection setup."
      : "This packet acknowledges delivery to keep transfer reliable.";

    return {
      id: p.id,
      origin: p.srcIp,
      path,
      destination: p.dstIp,
      layerStatus: `${this.layerMode.toUpperCase()} @ ${hop}`,
      lifecycle: p.lifecycle,
      seqRange: p.kind === "data" ? `${p.seqStart}-${p.seqEnd}` : undefined,
      ack: p.kind === "ack" ? p.ack : undefined,
      signalTimingMs,
      signalError: p.lost ? this.lossReasonBySegment.get(p.segmentIndex) ?? "Signal drop detected." : undefined,
      ipHop: hop,
      fragmentInfo,
      appPurpose,
    };
  }

  private statusLine(): string {
    if (this.phase === "idle") return "Ready";
    if (this.phase === "paused") return "Paused for explanation";
    if (this.phase === "done" && this.result) {
      return this.result.success
        ? `Done: delivered "${this.result.deliveredMessage}"`
        : `Stopped: delivered "${this.result.deliveredMessage}"`;
    }
    return this.config.useTcp ? "TCP reliable transport" : "ARPANET-style unreliable transport";
  }

  private enqueueNarrative(step: NarrativeStep): void {
    if (!this.runtime.narrativeEnabled) return;
    this.narrativeQueue.push(step);
    if (!this.currentNarrativeStep && this.phase === "running") {
      this.nextNarrativeStep();
    }
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
    this.avgRttMs = 0;
    this.rttCount = 0;
    this.totalSent = 0;
    this.totalLost = 0;
    this.totalRetransmit = 0;
    this.totalAcked = 0;
    this.totalBytesSent = 0;
    this.totalBytesDelivered = 0;
    this.lossReasonBySegment.clear();
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
    this.currentNarrativeStep = null;
    this.narrativeQueue = [];
    this.narrativeAutoUntil = 0;
    this.layerStepCounts = {
      physical: 0,
      ip: 0,
      tcp: 0,
      application: 0,
    };
    this.storyLossExplained = false;
    this.storyRetransmitExplained = false;
    this.storyReorderExplained = false;

    this.rng = mulberry32(
      this.config.message.length * 7919 + Math.floor(this.config.packetLoss * 10000),
    );

    const msg = this.config.message || "";
    let chunks = segmentPayload(msg, 3);
    if (!this.config.useTcp && this.config.arpanetMode) {
      chunks = [msg.slice(0, 2) || msg.slice(0, 1) || ""];
      this.log("protocol", "ARPANET: only partial payload survives.");
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
    this.storyMode = false;
    this.storyStage = 0;
    this.storyReplayAt = null;
    this.storyReplayActive = false;
    this.resetInternals();
  }

  start(): void {
    if (this.phase === "running") return;
    this.resetInternals();
    this.phase = "running";
    this.log("info", `Start ${this.payloads.length} segment(s)`);
    this.enqueueNarrative({
      id: "app_start",
      layer: "application",
      explanation:
        "The client application creates a message (for example, an HTTP request).",
      packetState: `Message="${this.config.message || ""}"`,
      location: "CLIENT",
    });
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
    const d = 0.34 / Math.max(0.2, this.runtime.timeScale);
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
          this.enqueueNarrative({
            id: "dns_lookup",
            layer: "application",
            explanation:
              "DNS translates a human-friendly domain name into an IP address computers can route to.",
            packetState: "Query: example.org -> ?",
            location: "CLIENT",
          });
          break;
        case "dns_answer":
          this.protocol.dnsDone = true;
          this.protocol.dnsCached = true;
          this.log("protocol", `DNS answer cached (${RECEIVER_IP})`);
          break;
        case "tls_client_hello":
          this.log("protocol", "TLS ClientHello");
          this.enqueueNarrative({
            id: "tls_handshake",
            layer: "application",
            explanation:
              "TLS handshake authenticates the server and negotiates encryption keys, helping prevent man-in-the-middle attacks.",
            packetState: "ClientHello / certificate check",
            location: "CLIENT",
          });
          break;
        case "tls_server_hello":
          this.log("protocol", "TLS ServerHello");
          break;
        case "tls_keys_ready":
          this.protocol.tlsDone = true;
          this.log("protocol", "TLS keys ready");
          break;
        case "http_request":
          this.protocol.httpRequestSent = true;
          this.appReady = true;
          this.log("protocol", "HTTP GET /login");
          this.enqueueNarrative({
            id: "http_exchange",
            layer: "application",
            explanation:
              "HTTP request asks for a resource; the server sends an HTTP response with the content or status.",
            packetState: "GET /login",
            location: "CLIENT",
          });
          this.launchTransportFlow();
          break;
        case "http_response":
          this.protocol.httpResponseReceived = true;
          this.log("protocol", "HTTP 200 OK");
          this.enqueueNarrative({
            id: "cookie_state",
            layer: "application",
            explanation:
              "Cookies let HTTP remember user state across requests (for example, session login) even though HTTP is stateless.",
            packetState: "Set-Cookie: session=...",
            location: "SERVER",
          });
          break;
      }
    }
  }

  private effectiveWindow(): number {
    if (!this.config.useTcp) return this.sendQueue.length;
    return BASE_TCP_WINDOW;
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
    this.enqueueNarrative({
      id: "tcp_segment",
      layer: "tcp",
      explanation:
        "TCP splits the message into segments and adds sequence numbers so missing pieces can be recovered.",
      packetState: `Segments=${this.payloads.length}`,
      location: "CLIENT",
    });
    this.enqueueNarrative({
      id: "ip_wrap",
      layer: "ip",
      explanation:
        "IP adds source and destination addresses so routers know where to forward the packet next.",
      packetState: `${SENDER_IP} -> ${RECEIVER_IP}`,
      location: "CLIENT",
    });
    this.enqueueNarrative({
      id: "physical_send",
      layer: "physical",
      explanation:
        "At the data-link and physical layers, frames are sent as bits over the link.",
      packetState: "Frame emitted",
      location: "CLIENT",
    });

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
    this.enqueueNarrative({
      id: "ack_return",
      layer: "tcp",
      explanation:
        "The server sends an ACK back to confirm receipt, allowing the client to move forward reliably.",
      packetState: `ACK ${ack}`,
      location: "SERVER",
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
    if (this.timeline.length > 300) this.timeline.shift();
  }

  tick(dt: number): void {
    if (
      this.currentNarrativeStep &&
      this.phase === "running" &&
      this.runtime.autoPlay &&
      this.time >= this.narrativeAutoUntil
    ) {
      this.currentNarrativeStep = null;
      const next = this.narrativeQueue.shift() ?? null;
      if (next) this.pauseAtNarrativeStep(next);
    }

    if (this.storyReplayAt !== null && this.time >= this.storyReplayAt) {
      this.storyReplayAt = null;
      this.continueStoryIfNeeded();
      return;
    }

    if (this.phase !== "running") return;

    const scaledDt = dt * Math.max(0.1, this.runtime.timeScale);
    const baseHop = Math.max(BASE_HOP_SEC, this.config.delayMs / 1000);
    const hopSec = baseHop / Math.max(0.25, this.config.speedFactor);
    this.time += scaledDt;

    this.processScheduled();

    const due = this.retransmitAt.filter((r) => r.at <= this.time);
    this.retransmitAt = this.retransmitAt.filter((r) => r.at > this.time);
    for (const r of due) {
      if (!this.config.useTcp || this.config.arpanetMode) continue;
      if (this.tcpAcked[r.seg.index]) continue;
      this.totalRetransmit += 1;
      r.seg.retransmits += 1;
      r.seg.sentAt = this.time;
      this.sentAtBySegment.set(r.seg.index, this.time);
      this.spawnData(r.seg, r.seg.index % MAX_PARALLEL, r.seg.retransmits);
      if (r.fromDataLoss) this.inFlight += 1;
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
        if (p.kind === "data" && p.forward) {
          if (p.hopIndex === 1) {
            this.enqueueNarrative({
              id: "router_forward",
              layer: "ip",
              explanation:
                "Routers forward packets based on destination IP; they do not interpret application data.",
              packetState: `Segment ${p.segmentIndex + 1}`,
              location: "ROUTER 1",
            });
          }
          if (p.hopIndex >= EDGE_HOPS) {
            this.onDataArrived(p);
            this.packets.splice(i, 1);
            if (this.phase !== "running") return;
            break;
          }
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
    this.lossReasonBySegment.set(
      p.segmentIndex,
      p.kind === "data"
        ? "Packet was lost in transit; TCP schedules retransmission."
        : "ACK was lost on return path; sender may resend missing segment.",
    );
    this.log("lost", `${p.kind.toUpperCase()} lost`, { packetId: p.id, seq: p.seq, ack: p.ack });

    if (p.kind === "data" && this.config.useTcp) {
      if (this.storyReplayActive && !this.storyLossExplained) {
        this.storyLossExplained = true;
        this.enqueueNarrative({
          id: "tcp_loss_detected",
          layer: "tcp",
          explanation:
            "A segment is lost on the network path. TCP detects the missing data because delivery is not acknowledged.",
          packetState: `Missing SEQ ${p.seqStart}-${p.seqEnd}`,
          location: "ROUTER 2",
        });
      }
      if (this.config.arpanetMode) {
        this.crashed = true;
        this.delivered = this.payloads.slice(0, p.segmentIndex).join("");
        this.enqueueNarrative({
          id: "arpanet_fail",
          layer: "application",
          explanation:
            "Only part of the message arrived (LO). Early networks had no end-to-end reliability.",
          packetState: `Delivered="${this.delivered}"`,
          location: "SERVER",
        });
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
        });
        if (this.storyReplayActive && !this.storyRetransmitExplained) {
          this.storyRetransmitExplained = true;
          this.enqueueNarrative({
            id: "tcp_retransmit_story",
            layer: "tcp",
            explanation:
              "TCP automatically resends the missing segment so communication can recover without restarting the app.",
            packetState: `Retransmit SEQ ${seg.seq}-${seg.seq + seg.pl.length}`,
            location: "CLIENT",
          });
        }
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
      });
    }
  }

  private onDataArrived(p: VisualPacket): void {
    p.lifecycle = "delivered";
    this.enqueueNarrative({
      id: "server_arrival",
      layer: "application",
      explanation:
        "The server receives the segment and TCP reassembles ordered data for the application.",
      packetState: `Segment ${p.segmentIndex + 1} arrived`,
      location: "SERVER",
    });

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
    this.log("info", `ACK ${p.ack} received`, { ack: p.ack, packetId: p.id });
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

    if (this.storyReplayActive && !this.storyReorderExplained) {
      this.storyReorderExplained = true;
      this.enqueueNarrative({
        id: "tcp_reorder_reassembly",
        layer: "tcp",
        explanation:
          "TCP uses sequence numbers to place segments in order, then reconstructs the original message stream.",
        packetState: `Reassembly so far: "${this.delivered}"`,
        location: "SERVER",
      });
    }

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

    if (this.storyMode && this.storyStage === 1 && !this.config.useTcp) {
      this.enqueueNarrative({
        id: "story_tcp_replay",
        layer: "tcp",
        explanation:
          "Now switch to TCP and replay. TCP retransmits missing data so the full message arrives.",
        packetState: "Replay with reliability",
        location: "CLIENT",
      });
      this.storyStage = 2;
      this.currentNarrativeStep = this.narrativeQueue.shift() ?? null;
      this.narrativeAutoUntil = this.time + 1.75 / Math.max(0.2, this.runtime.timeScale);
      this.storyReplayAt = this.time + 2.0 / Math.max(0.2, this.runtime.timeScale);
      return;
    }

    this.enqueueNarrative({
      id: "complete",
      layer: "application",
      explanation:
        success && deliveredOk
          ? "All segments are reassembled in order, and the full message is delivered successfully at the destination."
          : "Transfer incomplete.",
      packetState: `Delivered="${this.delivered}"`,
      location: "SERVER",
    });
    this.log("info", success && deliveredOk ? "Complete." : "Incomplete.");
  }

  continueStoryIfNeeded(): void {
    if (!(this.storyMode && this.storyStage === 2)) return;
    this.storyMode = true;
    this.storyStage = 0;
    this.storyReplayActive = true;
    this.setConfig({ message: "LOGIN", useTcp: true, arpanetMode: false, packetLoss: 0.18 });
    this.start();
  }
}
