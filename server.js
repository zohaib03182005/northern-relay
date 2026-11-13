// Northern Travels — WhatsApp call relay (Node, for Render free tier)
const http = require("http");
const { WebSocketServer } = require("ws");
const { randomUUID } = require("crypto");

const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("relay ok");
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });
let control = null;
const calls = new Map();

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/control") {
    control = ws;
    ws.on("close", () => { if (control === ws) control = null; });
    ws.on("error", () => { if (control === ws) control = null; });
  } else if (url.pathname === "/zernio") {
    const id = randomUUID();
    const entry = { zernio: ws, agent: null };
    calls.set(id, entry);
    ws.on("message", (data, isBinary) => {
      if (entry.agent && entry.agent.readyState === 1) entry.agent.send(data, { binary: isBinary });
    });
    const done = () => { try { entry.agent?.close(); } catch {} calls.delete(id); };
    ws.on("close", done);
    ws.on("error", done);
    if (control && control.readyState === 1) control.send(JSON.stringify({ type: "call", id }));
  } else if (url.pathname === "/agent") {
    const id = url.searchParams.get("id") || "";
    const entry = calls.get(id);
    if (!entry) { ws.close(4404, "no such call"); return; }
    entry.agent = ws;
    ws.on("message", (data, isBinary) => {
      if (entry.zernio.readyState === 1) entry.zernio.send(data, { binary: isBinary });
    });
    const done = () => { try { entry.zernio.close(); } catch {} calls.delete(id); };
    ws.on("close", done);
    ws.on("error", done);
  } else {
    ws.close(4404, "unknown path");
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("relay listening on", PORT));
