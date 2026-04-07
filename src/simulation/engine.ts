import type {
  IpHeaderView,
  MacHeaderView,
  NetworkPath,
  SimEvent,
  SimulationConfig,
  SimulationResult,
  TcpHeaderView,
} from "./types";
import { segmentPayload, simpleChecksum, utf8ToBitString } from "./types";

const SENDER_IP = "192.168.1.10";
const RECEIVER_IP = "203.0.113.50";
const SENDER_MAC = "AA:BB:CC:DD:EE:01";
const GW_MAC = "AA:BB:CC:DD:EE:F0";

const CLIENT_PORT = 49152;
const SERVER_PORT = 80;

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickPath(rng: () => number): NetworkPath {
  return rng() < 0.5 ? "pathA" : "pathB";
}

function delayFor(
  cfg: SimulationConfig,
  hops: number,
): number {
  const base = cfg.delayMs * hops;
  return Math.max(40, base / cfg.speedFactor);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}

function buildTcpView(
  seq: number,
  ack: number,
  payload: string,
  flags: string[],
  checksumEnabled: boolean,
): TcpHeaderView {
  const body = checksumEnabled ? payload : payload;
  return {
    srcPort: CLIENT_PORT,
    dstPort: SERVER_PORT,
    seq,
    ack,
    flags,
    window: 65535,
    checksum: checksumEnabled ? simpleChecksum(payload + flags.join()) : "0x0000 (disabled)",
    payload: body,
  };
}

function buildIpView(
  id: number,
  payloadLen: number,
  protocol: 6 | 17 = 6,
): IpHeaderView {
  const transportHeader = protocol === 6 ? 20 : 8;
  return {
    src: SENDER_IP,
    dst: RECEIVER_IP,
    protocol,
    ttl: 64,
    id,
    totalLength: 20 + transportHeader + payloadLen,
  };
}

function buildMacView(
  src: string,
  dst: string,
): MacHeaderView {
  return { src, dst, ethertype: "0x0800 (IPv4)" };
}

const HOPS_SEND = [
  { from: "Client", to: "Switch", path: "pathA" as const },
  { from: "Switch", to: "Router R1", path: "pathA" as const },
  { from: "Router R1", to: "Router R2", path: "pathB" as const },
  { from: "Router R2", to: "Server", path: "pathA" as const },
];

export async function runSimulation(
  cfg: SimulationConfig,
  onEvent: (e: SimEvent) => void,
  signal?: AbortSignal,
): Promise<SimulationResult> {
  const rng = mulberry32(cfg.message.length * 7919 + Math.floor(cfg.packetLoss * 10000));
  let t = 0;
  const emit = (e: Omit<SimEvent, "t">) => {
    t += 1;
    onEvent({ ...e, t });
  };

  const message = cfg.message || "(empty)";
  let payloads = segmentPayload(message, 3);

  if (!cfg.useTcp && cfg.arpanetMode) {
    payloads = [message.slice(0, 2) || message.slice(0, 1) || ""];
    emit({
      type: "arpanet_partial",
      detail:
        "ARPANET-style (no TCP): only a partial payload (e.g. \"LO\") reaches the app; the rest of the message is never delivered.",
    });
    await sleep(delayFor(cfg, 1), signal);
  }

  let delivered = "";
  let crashed = false;
  const baseSeq = 1000;

  if (!cfg.useTcp) {
    for (let i = 0; i < payloads.length; i++) {
      const p = payloads[i]!;
      const path = pickPath(rng);
      emit({
        type: "application_out",
        message: p,
        segmentIndex: i,
        totalSegments: payloads.length,
        detail: "UDP-like: no connection setup; each datagram is independent.",
      });
      await sleep(delayFor(cfg, 1), signal);

      const tcp = buildTcpView(
        baseSeq + i * 100,
        0,
        p,
        ["PSH"],
        cfg.checksumEnabled,
      );
      emit({ type: "tcp_segment", tcp, segmentIndex: i, totalSegments: payloads.length });
      await sleep(delayFor(cfg, 1), signal);

      const ip = buildIpView(100 + i, p.length, 17);
      emit({ type: "ip_datagram", ip, segmentIndex: i });
      await sleep(delayFor(cfg, 1), signal);

      const mac = buildMacView(SENDER_MAC, GW_MAC);
      emit({ type: "ethernet_frame", mac, segmentIndex: i });
      await sleep(delayFor(cfg, 1), signal);

      emit({
        type: "physical_bits",
        bitsPreview: utf8ToBitString(p).slice(0, 96) + (utf8ToBitString(p).length > 96 ? "…" : ""),
        segmentIndex: i,
      });
      await sleep(delayFor(cfg, 1), signal);

      let lostInTransit = false;
      for (const hop of HOPS_SEND) {
        const usePath = hop.path === "pathB" ? "pathB" : path;
        emit({
          type: "route_hop",
          hop: { from: hop.from, to: hop.to, path: usePath },
          segmentIndex: i,
        });
        await sleep(delayFor(cfg, 2), signal);

        if (rng() < cfg.packetLoss) {
          emit({
            type: "packet_lost",
            segmentIndex: i,
            detail: `Lost on hop ${hop.from} → ${hop.to} (${usePath}). No retransmission (no TCP).`,
          });
          await sleep(delayFor(cfg, 2), signal);
          lostInTransit = true;
          break;
        }
      }

      if (!lostInTransit) {
        if (cfg.checksumEnabled && rng() < 0.08 && !cfg.arpanetMode) {
          emit({
            type: "checksum_fail",
            segmentIndex: i,
            detail: "Receiver dropped corrupted datagram (checksum mismatch).",
          });
          await sleep(delayFor(cfg, 2), signal);
        } else {
          delivered += p;
          emit({
            type: "segment_received",
            segmentIndex: i,
            detail: "Application receives payload (unordered delivery possible in real UDP).",
          });
        }
      }
      await sleep(delayFor(cfg, 1), signal);
    }

    emit({ type: "udp_complete", message: delivered });
    const ok = delivered === message;
    emit({ type: "sim_done", success: ok });
    return {
      deliveredMessage: delivered,
      crashed: cfg.arpanetMode && !ok,
      success: ok,
    };
  }

  /** TCP mode */
  const pending = payloads.map((pl, i) => ({
    index: i,
    payload: pl,
    seq: baseSeq + i * 100,
    retransmits: 0,
  }));

  const received: string[] = new Array(payloads.length).fill("");

  for (const seg of pending) {
    let done = false;
    while (!done) {
      const path = pickPath(rng);
      emit({
        type: "application_out",
        message: seg.payload,
        segmentIndex: seg.index,
        totalSegments: payloads.length,
        detail: "TCP sends a byte stream in segments; seq tracks position in the stream.",
      });
      await sleep(delayFor(cfg, 1), signal);

      const tcp = buildTcpView(
        seg.seq,
        baseSeq - 100 + delivered.length,
        seg.payload,
        ["PSH", "ACK"],
        cfg.checksumEnabled,
      );
      emit({
        type: "tcp_segment",
        tcp,
        segmentIndex: seg.index,
        totalSegments: payloads.length,
      });
      await sleep(delayFor(cfg, 1), signal);

      const ip = buildIpView(200 + seg.index, seg.payload.length);
      emit({ type: "ip_datagram", ip, segmentIndex: seg.index });
      await sleep(delayFor(cfg, 1), signal);

      const mac = buildMacView(SENDER_MAC, GW_MAC);
      emit({ type: "ethernet_frame", mac, segmentIndex: seg.index });
      await sleep(delayFor(cfg, 1), signal);

      emit({
        type: "physical_bits",
        bitsPreview:
          utf8ToBitString(seg.payload).slice(0, 96) +
          (utf8ToBitString(seg.payload).length > 96 ? "…" : ""),
        segmentIndex: seg.index,
      });
      await sleep(delayFor(cfg, 1), signal);

      let lostOnHop: string | null = null;
      for (const hop of HOPS_SEND) {
        const usePath = hop.path === "pathB" ? "pathB" : path;
        emit({
          type: "route_hop",
          hop: { from: hop.from, to: hop.to, path: usePath },
          segmentIndex: seg.index,
        });
        await sleep(delayFor(cfg, 2), signal);
        if (rng() < cfg.packetLoss) {
          lostOnHop = `${hop.from} → ${hop.to}`;
          emit({
            type: "packet_lost",
            segmentIndex: seg.index,
            detail: `Segment lost on ${lostOnHop}. TCP will retransmit after timeout.`,
          });
          await sleep(delayFor(cfg, 2), signal);
          break;
        }
      }

      if (lostOnHop) {
        if (cfg.arpanetMode) {
          emit({
            type: "arpanet_crash",
            detail:
              "Historical ARPANET had no end-to-end reliability: loss could leave the application with partial data and no automatic recovery.",
          });
          crashed = true;
          delivered = received.filter(Boolean).join("") || message.slice(0, 2);
          emit({ type: "sim_done", success: false });
          return { deliveredMessage: delivered, crashed: true, success: false };
        }
        seg.retransmits += 1;
        emit({
          type: "retransmit",
          segmentIndex: seg.index,
          detail: `Retransmission #${seg.retransmits} for seq ${seg.seq}`,
        });
        await sleep(delayFor(cfg, 3), signal);
        continue;
      }

      if (cfg.checksumEnabled && rng() < 0.06) {
        emit({
          type: "checksum_fail",
          segmentIndex: seg.index,
          detail: "Bad checksum — discard; TCP retransmits from sender.",
        });
        await sleep(delayFor(cfg, 2), signal);
        seg.retransmits += 1;
        emit({
          type: "retransmit",
          segmentIndex: seg.index,
          detail: "Retransmit after failed checksum validation",
        });
        await sleep(delayFor(cfg, 2), signal);
        continue;
      }

      received[seg.index] = seg.payload;
      emit({
        type: "segment_received",
        segmentIndex: seg.index,
        detail: "Segment accepted in order; buffer updated.",
      });
      await sleep(delayFor(cfg, 1), signal);

      emit({
        type: "ack_sent",
        tcp: {
          srcPort: SERVER_PORT,
          dstPort: CLIENT_PORT,
          seq: 5000 + seg.index,
          ack: seg.seq + seg.payload.length,
          flags: ["ACK"],
          window: 65535,
          checksum: cfg.checksumEnabled
            ? simpleChecksum(`ack-${seg.seq}`)
            : "0x0000 (disabled)",
          payload: "",
        },
        segmentIndex: seg.index,
        detail: `ACK ack=${seg.seq + seg.payload.length} (next expected seq)`,
      });
      await sleep(delayFor(cfg, 1), signal);

      emit({
        type: "ack_received",
        segmentIndex: seg.index,
        detail: "Sender advances send window",
      });
      await sleep(delayFor(cfg, 1), signal);

      delivered = received.join("");
      done = true;
    }
  }

  emit({
    type: "tcp_complete",
    message: delivered,
    detail: "Full byte stream reassembled; connection reliable if all segments ACK’d.",
  });
  emit({ type: "sim_done", success: delivered === message });
  return { deliveredMessage: delivered, crashed, success: delivered === message };
}
