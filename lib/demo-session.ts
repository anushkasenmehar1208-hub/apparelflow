import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

export const demoRoles = ["CUTTING_SUPERVISOR", "CUTTING_VERIFIER", "SEWING_SUPERVISOR"] as const;
export type DemoRole = typeof demoRoles[number];
export const sessionCookie = "apparelflow-demo-session";
export const sessionLifetime = 8 * 60 * 60;
const globalSessions = globalThis as typeof globalThis & { apparelflowSessions?: Map<string, { userId: number; expires: number }> };
const sessions = globalSessions.apparelflowSessions ??= new Map();

export function issueSession(userId: number, previous?: string) {
  if (previous) sessions.delete(previous);
  for (const [token, value] of sessions) if (value.expires <= Date.now()) sessions.delete(token);
  if (sessions.size >= 1000) throw new Error("Demo session capacity reached.");
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { userId, expires: Date.now() + sessionLifetime * 1000 });
  return token;
}

export async function currentDemoUser() {
  const token = (await cookies()).get(sessionCookie)?.value;
  const session = token ? sessions.get(token) : undefined;
  if (!session || session.expires <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return getDb().user.findUnique({ where: { id: session.userId }, select: { id: true, role: true, fullName: true } });
}

export function sameOriginJson(request: Request) {
  // Next.js can normalize the internal URL to localhost. Compare the browser's
  // origin with the public Host and proxy-provided scheme instead.
  const host = request.headers.get("host");
  const scheme = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? new URL(request.url).protocol.slice(0, -1);
  return !!host && ["http", "https"].includes(scheme) &&
    request.headers.get("origin") === `${scheme}://${host}` &&
    request.headers.get("content-type")?.split(";")[0].trim() === "application/json";
}
