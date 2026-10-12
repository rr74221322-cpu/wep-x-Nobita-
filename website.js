const http = require("http");
const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "public");
const sessionsDir = path.join(process.cwd(), "sessions");
const startedAt = Date.now();
const ipWindows = new Map();
const phoneCooldown = new Map();
const inFlight = new Map();

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
    "X-Frame-Options": "DENY"
  });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2048) { reject(new Error("Request too large")); req.destroy(); }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch { reject(new Error("Invalid request")); }
    });
    req.on("error", reject);
  });
}
function allowRequest(ip) {
  const now = Date.now();
  const entry = ipWindows.get(ip);
  if (!entry || now - entry.start > 10 * 60 * 1000) {
    ipWindows.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}
async function stats(manager) {
  let totalPair = 0;
  try {
    const dirs = await fs.promises.readdir(sessionsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory() || !/^\d{8,15}$/.test(dir.name)) continue;
      try {
        const creds = JSON.parse(await fs.promises.readFile(path.join(sessionsDir, dir.name, "creds.json"), "utf8"));
        if (creds?.registered) totalPair++;
      } catch {}
    }
  } catch {}
  const activeSessions = manager?.sessions instanceof Map
    ? [...manager.sessions.values()].filter(s => s?.status === "connected").length : 0;
  return { running: true, uptime: Math.floor(process.uptime()), activeSessions, totalPair };
}
function startWebsite(manager) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/status") {
      return send(res, 200, await stats(manager));
    }
    if (req.method === "POST" && url.pathname === "/api/pair") {
      const ip = req.socket.remoteAddress || "unknown";
      if (!allowRequest(ip)) return send(res, 429, { error: "Too many attempts. Please wait 10 minutes." });
      let body;
      try { body = await readBody(req); }
      catch (e) { return send(res, 400, { error: e.message || "Invalid request" }); }
      const phone = String(body.phone || "").replace(/\D/g, "");
      if (!/^[1-9]\d{7,14}$/.test(phone)) return send(res, 400, { error: "Enter a valid phone number with country code." });
      const authDir = path.join(sessionsDir, phone);
      if (inFlight.has(phone)) return send(res, 429, { error: "A pairing request for this number is already in progress." });
      if (Date.now() - (phoneCooldown.get(phone) || 0) < 60_000) {
        return send(res, 429, { error: "Please wait 60 seconds before requesting another code for this number." });
      }
      try {
        const creds = JSON.parse(await fs.promises.readFile(path.join(authDir, "creds.json"), "utf8"));
        if (creds?.registered) return send(res, 409, { error: "This number already has a saved paired session." });
      } catch {}
      const promise = new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) { settled = true; reject(new Error("Pairing code timed out. Please try again.")); }
        }, 45_000);
        const options = {
          skipPairing: false,
          onPairingCode: code => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            resolve(String(code).replace(/\s+/g, "").replace(/(.{4})/g, "$1-").replace(/-$/, ""));
          },
          onPairingError: err => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            reject(err instanceof Error ? err : new Error("Pairing failed"));
          }
        };
        Promise.resolve(manager.start(phone, options)).catch(err => {
          if (settled) return;
          settled = true; clearTimeout(timer); reject(err);
        });
      });
      inFlight.set(phone, promise);
      phoneCooldown.set(phone, Date.now());
      try {
        const code = await promise;
        return send(res, 200, { code });
      } catch (err) {
        console.error("[Website pairing]", err?.message || err);
        return send(res, 502, { error: err?.message || "Pairing failed. Please try again." });
      } finally {
        inFlight.delete(phone);
      }
    }
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      try { return send(res, 200, await fs.promises.readFile(path.join(publicDir, "index.html"), "utf8"), "text/html; charset=utf-8"); }
      catch { return send(res, 500, "Website file missing", "text/plain; charset=utf-8"); }
    }
    return send(res, 404, { error: "Not found" });
  });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "0.0.0.0", () => console.log(`🌐 X NOBITA XD website listening on port ${port}`));
  return server;
}
module.exports = { startWebsite };
