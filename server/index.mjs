/**
 * Production server: static SPA + WebSocket endpoint for optional real-time hooks.
 * Dev: use `npm run dev` (Vite). This server serves `dist/` after `npm run build`.
 */
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "dist");

const app = express();
app.use(cors());
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "dataflow" });
});

app.use(express.static(root));

const server = createServer(app);

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "hello",
      message: "Dataflow WebSocket — optional channel for future multi-user demos.",
    }),
  );
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", t: Date.now() }));
      }
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
    }
  });
});

app.use((req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(root, "index.html"));
});

const PORT = process.env.PORT || 3847;
server.listen(PORT, () => {
  console.log(`Dataflow server http://127.0.0.1:${PORT}  (static + /ws)`);
});
