// Local workaround for networks that stall PostgreSQL's initial SSLRequest.
// Prisma talks over loopback; all traffic to Neon uses verified TLS.
import net from "node:net";
import tls from "node:tls";
import { spawn } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
const allowed = args.join(" ");
if (!["migrate deploy", "migrate status", "migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code"].includes(allowed)) {
  throw new Error("This helper only permits migrate deploy, status, or the documented read-only drift check.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const remote = new URL(process.env.DATABASE_URL);
if (remote.protocol !== "postgresql:" && remote.protocol !== "postgres:") throw new Error("A PostgreSQL URL is required.");
if (!remote.hostname.endsWith(".neon.tech")) throw new Error("This helper is only for the existing Neon endpoint.");
const sockets = new Set();
const server = net.createServer((local) => {
  local.pause();
  const secure = tls.connect({
    host: remote.hostname,
    port: Number(remote.port || 5432),
    servername: remote.hostname,
    ALPNProtocols: ["postgresql"],
    rejectUnauthorized: true,
  });
  sockets.add(local);
  sockets.add(secure);
  secure.setTimeout(15000, () => secure.destroy(new Error("TLS connection timed out.")));
  secure.once("secureConnect", () => {
    secure.setTimeout(0);
    local.pipe(secure);
    secure.pipe(local);
    local.resume();
  });
  for (const [socket, peer] of [[local, secure], [secure, local]]) {
    socket.on("error", () => peer.destroy());
    socket.once("close", () => { sockets.delete(socket); peer.destroy(); });
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const localUrl = new URL(remote);
localUrl.hostname = "127.0.0.1";
localUrl.port = String(server.address().port);
localUrl.searchParams.set("sslmode", "disable");
localUrl.searchParams.set("connect_timeout", "15");
localUrl.searchParams.delete("channel_binding");
localUrl.searchParams.delete("sslnegotiation");
const child = spawn(process.execPath, ["node_modules/prisma/build/index.js", ...args, "--config", "prisma7.config.ts"], {
  env: { ...process.env, DATABASE_URL: localUrl.toString() },
  stdio: ["ignore", "pipe", "pipe"],
});
const secrets = [remote.toString(), localUrl.toString(), remote.hostname,
  remote.password, decodeURIComponent(remote.password), remote.username, decodeURIComponent(remote.username)]
  .filter(Boolean).sort((a, b) => b.length - a.length);
const redact = (value) => secrets.reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value);
let output = "";
child.stdout.on("data", (chunk) => { output += chunk; });
child.stderr.on("data", (chunk) => { output += chunk; });
const timeout = setTimeout(() => child.kill("SIGTERM"), 60000);
let code;
try {
  code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (status) => resolve(status ?? 1));
  });
} finally {
  clearTimeout(timeout);
  for (const socket of sockets) socket.destroy();
  server.close();
}
console.log(redact(output));
process.exitCode = code;
