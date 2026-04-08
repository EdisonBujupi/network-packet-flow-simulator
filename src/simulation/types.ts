/** Educational TCP/IP simulation — simplified but layer-accurate headers */

export type NetworkPath = "pathA" | "pathB";

export type SimEventType =
  | "application_out"
  | "tcp_segment"
  | "ip_datagram"
  | "ethernet_frame"
  | "physical_bits"
  | "route_hop"
  | "packet_lost"
  | "checksum_fail"
  | "segment_received"
  | "ack_sent"
  | "ack_received"
  | "retransmit"
  | "arpanet_partial"
  | "arpanet_crash"
  | "tcp_complete"
  | "udp_complete"
  | "sim_done";

export interface SimEvent {
  type: SimEventType;
  t: number;
  success?: boolean;
  message?: string;
  segmentIndex?: number;
  totalSegments?: number;
  tcp?: TcpHeaderView;
  ip?: IpHeaderView;
  mac?: MacHeaderView;
  bitsPreview?: string;
  hop?: { from: string; to: string; path: NetworkPath };
  detail?: string;
}

export interface TcpHeaderView {
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  flags: string[];
  window: number;
  checksum: string;
  payload: string;
}

export interface IpHeaderView {
  src: string;
  dst: string;
  protocol: number;
  ttl: number;
  id: number;
  totalLength: number;
}

export interface MacHeaderView {
  src: string;
  dst: string;
  ethertype: string;
}

export interface SimulationConfig {
  message: string;
  /** 0–1 packet loss probability per hop */
  packetLoss: number;
  /** Base delay per hop (ms) */
  delayMs: number;
  /** 0.25–3 — lower = slower animation */
  speedFactor: number;
  useTcp: boolean;
  checksumEnabled: boolean;
  /** Early network: partial delivery, no TCP recovery */
  arpanetMode: boolean;
  /** Reproducible deterministic lab scenario */
  scenario:
    | "normal_flow"
    | "packet_loss"
    | "high_latency"
    | "dns_poisoning"
    | "tls_failure";
}

export interface SimulationResult {
  deliveredMessage: string;
  crashed: boolean;
  success: boolean;
}

const textEncoder = new TextEncoder();

export function utf8ToBitString(s: string, maxBits = 128): string {
  const bytes = textEncoder.encode(s);
  const bits: string[] = [];
  for (let i = 0; i < bytes.length && bits.length < maxBits; i++) {
    bits.push(bytes[i]!.toString(2).padStart(8, "0"));
  }
  return bits.join(" ");
}

export function simpleChecksum(data: string): string {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum = (sum + data.charCodeAt(i)) & 0xffff;
  return `0x${sum.toString(16).padStart(4, "0")}`;
}

/** Split payload into TCP-sized chunks (educational: small segments) */
export function segmentPayload(message: string, chunkSize = 3): string[] {
  if (!message) return [""];
  const out: string[] = [];
  for (let i = 0; i < message.length; i += chunkSize) {
    out.push(message.slice(i, i + chunkSize));
  }
  return out;
}
