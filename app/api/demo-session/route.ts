import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentDemoUser, demoRoles, DemoRole, issueSession, sameOriginJson, sessionCookie, sessionLifetime } from "@/lib/demo-session";
export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json({ user: await currentDemoUser() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Demo session unavailable. Please retry." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOriginJson(request)) return NextResponse.json({ error: "Same-origin JSON request required." }, { status: 403 });
  try {
    const body = await request.json().catch(() => null);
    if (!demoRoles.includes(body?.role)) return NextResponse.json({ error: "Select a valid demo role." }, { status: 400 });
    const role: DemoRole = body.role;
    const user = await getDb().user.upsert({
      where: { email: `${role.toLowerCase()}@demo.apparelflow.invalid` }, update: {},
      create: { email: `${role.toLowerCase()}@demo.apparelflow.invalid`, role, fullName: `Demo ${role.toLowerCase().replaceAll("_", " ")}`, passwordHash: `!demo-password-login-disabled:${randomUUID()}` },
      select: { id: true, role: true, fullName: true },
    });
    if (user.role !== role) return NextResponse.json({ error: "Demo account role mismatch; contact the administrator." }, { status: 409 });
    const token = issueSession(user.id, (await cookies()).get(sessionCookie)?.value);
    const response = NextResponse.json({ user });
    response.cookies.set(sessionCookie, token, { httpOnly: true, sameSite: "strict", secure: new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https", path: "/", maxAge: sessionLifetime });
    return response;
  } catch { return NextResponse.json({ error: "Unable to start the demo session. Please retry." }, { status: 503 }); }
}
