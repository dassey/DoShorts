import { connection } from "next/server";
import { currentUser } from "@/auth";
import { hostedAvailable } from "@/lib/run";
import { readUsage, remainingFor } from "@/lib/usage";

export async function GET() {
  // Answer from the running server's environment, never from a build-time prerender.
  await connection();
  const hosted = hostedAvailable();
  const authEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const user = authEnabled ? await currentUser() : null;
  return Response.json({
    user,
    /** A built-in AI is configured on this deployment. */
    hosted,
    authEnabled,
    remaining: hosted && !user ? remainingFor(await readUsage()) : null,
  });
}
