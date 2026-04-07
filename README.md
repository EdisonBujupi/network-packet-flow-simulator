# Dataflow TCP/IP Narrative Simulator

Interactive educational simulator that visualizes packet flow across the TCP/IP stack with:

- a single `requestAnimationFrame` loop
- pure canvas rendering (no DOM-driven packet animation)
- deterministic, repeatable simulation behavior
- automatic guided narration tied to active protocol/layer events

The app teaches first-principles networking and protocol flow, including the ARPANET partial-failure story and TCP reliability replay.

## Features

- Fixed topology: `CLIENT -> ROUTER 1 -> ROUTER 2 -> SERVER`
- Layer-driven visualization:
  - **Physical**: bit/signal transmission, propagation context
  - **IP**: source/destination IP and routing hops
  - **TCP**: segmentation, sequence/acknowledgment, retransmission, reassembly
  - **Application**: DNS/TLS/HTTP/Cookie purpose-focused narrative
- Continuous narrative overlay:
  - current layer and node
  - beginner-friendly explanation
  - focused packet context (origin, path, destination, lifecycle)
- Story mode:
  - ARPANET-like partial delivery (`LO`)
  - automatic TCP replay to demonstrate reliable end-to-end recovery
- Timeline panel:
  - packet id, seq/ack, path, protocol events
- End-of-simulation summary:
  - total sent/received packets
  - retransmissions and loss rate
  - layer-wise narrative breakdown
  - key learning takeaways
- Hover tooltip on canvas packets:
  - packet id, IPs, seq/ack, payload summary
- Log export:
  - download timeline as JSON for offline study/review

## Controls

- `Start`
- `Pause`
- `Resume`
- `Reset`
- `Speed`
- `Auto Play` (narrative auto-advance control)
- `Loss` + packet-loss slider
- `Latency` slider
- `Story Mode`
- `Export Logs`

## Architecture

### Core simulation

- `src/simulation/canvasSim.ts`
  - state machine: `idle | running | paused | done`
  - deterministic packet movement and lifecycle
  - protocol staging (DNS, TLS handshake, HTTP request/response, cookie state)
  - narrative queue, story flow, and focused-packet context
  - summary metrics and layer breakdown

### Rendering

- `src/render/drawNetwork.ts`
  - pure draw function (no side effects)
  - layer-specific rendering rules
  - active layer badge + active node highlighting
  - inline educational cues and packet overlays

- `src/components/NetworkCanvas.tsx`
  - single rAF loop
  - `sim.tick(dt)` then `drawNetwork(...)`
  - resize-safe canvas with DPR scaling

### UI integration

- `src/hooks/useCanvasSimulation.ts`
  - bridges React controls to simulation APIs
  - timeline export utility
  - throttled UI refresh for panels

- `src/components/ControlBar.tsx`
- `src/components/NarrativePanel.tsx`
- `src/components/SidePanel.tsx`
- `src/App.tsx`

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm start
```

## Notes

- The simulator is intentionally educational and simplified.
- It prioritizes conceptual clarity and deterministic behavior over full protocol stack completeness.
