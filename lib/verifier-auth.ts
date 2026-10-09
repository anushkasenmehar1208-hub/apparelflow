import { currentDemoUser } from "@/lib/demo-session";

export async function requireVerifier() {
  const user = await currentDemoUser();

  if (!user) {
    return {
      error: Response.json(
        { error: "Sign in with a demo role to continue." },
        { status: 401 },
      ),
    } as const;
  }

  if (user.role !== "CUTTING_VERIFIER") {
    return {
      error: Response.json(
        { error: "Only a Cutting Verifier can verify cutting orders." },
        { status: 403 },
      ),
    } as const;
  }

  return { user } as const;
}
