import { currentDemoUser } from "@/lib/demo-session";

export async function requireSewingSupervisor() {
  const user = await currentDemoUser();

  if (!user) {
    return {
      error: Response.json(
        { error: "Sign in with a demo role to continue." },
        { status: 401 },
      ),
    } as const;
  }

  if (user.role !== "SEWING_SUPERVISOR") {
    return {
      error: Response.json(
        { error: "Only a Sewing Supervisor can access the sewing queue." },
        { status: 403 },
      ),
    } as const;
  }

  return { user } as const;
}
