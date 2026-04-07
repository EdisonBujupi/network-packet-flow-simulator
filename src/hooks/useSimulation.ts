import { useCallback, useRef, useState } from "react";
import { runSimulation } from "../simulation/engine";
import type { SimEvent, SimulationConfig, SimulationResult } from "../simulation/types";

export interface LogEntry {
  id: number;
  at: number;
  label: string;
  kind: "info" | "warn" | "danger" | "ok";
}

const defaultConfig: SimulationConfig = {
  message: "LOGIN",
  packetLoss: 0.12,
  delayMs: 120,
  speedFactor: 1,
  useTcp: true,
  checksumEnabled: true,
  arpanetMode: false,
};

export function useSimulation() {
  const [config, setConfig] = useState<SimulationConfig>(defaultConfig);
  const [running, setRunning] = useState(false);
  const [lastEvent, setLastEvent] = useState<SimEvent | null>(null);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [timeline, setTimeline] = useState<{ t: number; label: string }[]>([]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logId = useRef(0);

  const pushLog = useCallback((label: string, kind: LogEntry["kind"]) => {
    logId.current += 1;
    setLogs((prev) => [
      ...prev.slice(-400),
      { id: logId.current, at: Date.now(), label, kind },
    ]);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    logId.current = 0;
    setEvents([]);
    setLastEvent(null);
    setLogs([]);
    setTimeline([]);
    setResult(null);
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    reset();
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;

    const onEvent = (e: SimEvent) => {
      setLastEvent(e);
      setEvents((prev) => [...prev.slice(-500), e]);
      const short = eventToLabel(e);
      setTimeline((prev) => [...prev.slice(-200), { t: e.t, label: short }]);
      const { kind, text } = eventToLog(e);
      pushLog(text, kind);
    };

    try {
      const res = await runSimulation(config, onEvent, ac.signal);
      setResult(res);
    } catch {
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [config, pushLog, reset]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  return {
    config,
    setConfig,
    running,
    lastEvent,
    events,
    logs,
    timeline,
    result,
    start,
    stop,
    reset,
  };
}

function eventToLabel(e: SimEvent): string {
  switch (e.type) {
    case "application_out":
      return `App → TCP: “${e.message ?? ""}”`;
    case "tcp_segment":
      return `TCP segment seq=${e.tcp?.seq}`;
    case "ip_datagram":
      return `IP ${e.ip?.src} → ${e.ip?.dst}`;
    case "ethernet_frame":
      return `Ethernet ${e.mac?.src} → ${e.mac?.dst}`;
    case "physical_bits":
      return "Physical: bits on the wire";
    case "route_hop":
      return `Hop ${e.hop?.from} → ${e.hop?.to} (${e.hop?.path})`;
    case "packet_lost":
      return `Lost seg#${e.segmentIndex ?? "?"}`;
    case "checksum_fail":
      return `Checksum fail seg#${e.segmentIndex ?? "?"}`;
    case "retransmit":
      return `Retransmit seg#${e.segmentIndex ?? "?"}`;
    case "ack_sent":
      return `ACK ${e.tcp?.ack}`;
    case "ack_received":
      return "ACK received";
    case "segment_received":
      return `Delivered seg#${e.segmentIndex ?? "?"}`;
    case "arpanet_partial":
      return "ARPANET partial delivery";
    case "arpanet_crash":
      return "Application crash (no recovery)";
    case "tcp_complete":
      return "TCP stream complete";
    case "udp_complete":
      return "UDP datagrams done";
    case "sim_done":
      return "Simulation end";
    default:
      return e.type;
  }
}

function eventToLog(e: SimEvent): { kind: LogEntry["kind"]; text: string } {
  const d = e.detail ? ` — ${e.detail}` : "";
  switch (e.type) {
    case "packet_lost":
      return { kind: "warn", text: `Packet lost (seg ${e.segmentIndex})${d}` };
    case "checksum_fail":
      return { kind: "warn", text: `Checksum / corruption (seg ${e.segmentIndex})${d}` };
    case "retransmit":
      return { kind: "info", text: `Retransmission${d}` };
    case "arpanet_crash":
      return { kind: "danger", text: `Crash / partial state${d}` };
    case "tcp_complete":
      return { kind: "ok", text: `TCP: full message assembled — “${e.message ?? ""}”` };
    case "udp_complete":
      return { kind: "info", text: `UDP-like result — “${e.message ?? ""}”` };
    case "sim_done":
      return {
        kind: e.success ? "ok" : "warn",
        text: e.success ? "Transfer completed successfully." : "Transfer incomplete or failed.",
      };
    default:
      return { kind: "info", text: `${eventToLabel(e)}${d}` };
  }
}
