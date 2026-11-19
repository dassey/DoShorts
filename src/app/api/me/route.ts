import { currentUser } from "@/auth";
import { readUsage, remainingFor } from "@/lib/usage";

export async function GET() {
  const user = await currentUser();
  return Response.json({
    user,
    remaining: user ? null : remainingFor(await readUsage()),
  });
}
