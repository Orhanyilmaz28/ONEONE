// Lokale Brücke: Upstash-REST (POST JSON-Befehl) → lokaler Test-Redis (RESP) – NUR für Tests mit einer isolierten Testdatenbank.
// Aufruf: node tests/helpers/upstash-bridge.mjs <http-port> <redis-port> [token]   (Standard-Token: „testtoken“)
import http from "node:http";
import net from "node:net";
const PORT = Number(process.argv[2] ?? 8790), REDIS_PORT = Number(process.argv[3] ?? 6379), TOKEN = process.argv[4] ?? "testtoken";
function encode(args) { return `*${args.length}\r\n` + args.map((a) => { const s = String(a); return `$${Buffer.byteLength(s)}\r\n${s}\r\n`; }).join(""); }
function parse(buf, i = 0) {
  if (i >= buf.length) throw new Error("incomplete");
  const t = String.fromCharCode(buf[i]); const end = buf.indexOf("\r\n", i); if (end < 0) throw new Error("incomplete"); const line = buf.toString("utf8", i + 1, end);
  if (t === "+") return [line, end + 2]; if (t === "-") return [{ error: line }, end + 2]; if (t === ":") return [Number(line), end + 2];
  if (t === "$") { const n = Number(line); if (n < 0) return [null, end + 2]; if (buf.length < end + 4 + n) throw new Error("incomplete"); return [buf.toString("utf8", end + 2, end + 2 + n), end + 4 + n]; }
  if (t === "*") { const n = Number(line); if (n < 0) return [null, end + 2]; let p = end + 2; const out = []; for (let k = 0; k < n; k++) { const [v, q] = parse(buf, p); out.push(v); p = q; } return [out, p]; }
  throw new Error("RESP?");
}
function command(args) {
  return new Promise((resolve, reject) => {
    const c = net.connect(REDIS_PORT, "127.0.0.1"); let buf = Buffer.alloc(0);
    c.on("data", (d) => { buf = Buffer.concat([buf, d]); try { const [v] = parse(buf); c.end(); resolve(v); } catch {} });
    c.on("error", reject); c.write(encode(args));
  });
}
http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end(); }
  let body = ""; for await (const ch of req) body += ch;
  const wrap = (v) => (v && typeof v === "object" && !Array.isArray(v) && "error" in v ? { error: v.error } : { result: v });
  if (req.method === "POST" && (req.url === "/pipeline" || req.url === "/multi-exec")) {
    // Sammelbefehle wie bei Upstash: Liste von Befehlen → Liste von Ergebnissen (nacheinander ausgeführt)
    try { const out = []; for (const cmd of JSON.parse(body)) out.push(wrap(await command(cmd)));
      res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(500); return res.end(JSON.stringify({ error: String(e) })); }
  }
  const args = req.method === "GET" ? req.url.split("/").filter(Boolean).map(decodeURIComponent) : JSON.parse(body);
  try { const v = await command(args); res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(v && typeof v === "object" && "error" in v ? { error: v.error } : { result: v }));
  } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
}).listen(PORT, "127.0.0.1", () => console.log("bridge on", PORT));
