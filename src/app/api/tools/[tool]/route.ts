import { currentUser } from "@/auth";
import { GenerationError } from "@/lib/errors";
import { hostedAvailable, runTool } from "@/lib/run";
import { inputs } from "@/lib/schemas";
import { FREE_USES_PER_TOOL, getTool } from "@/lib/tools";
import { readUsage, remainingFor, writeUsage } from "@/lib/usage";

export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const tool = getTool((await params).tool);
  if (!tool) return Response.json({ error: "Unknown tool." }, { status: 404 });

  if (!hostedAvailable()) {
    return Response.json({ error: "No built-in AI is set up here. Choose your own in AI settings." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = inputs[tool.slug].safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Check the form and try again." }, { status: 400 });
  }

  // Signed-in users are unlimited. Anonymous visitors get a fixed number of runs per tool.
  const user = await currentUser();
  const usage = user ? {} : await readUsage();
  if (!user && (usage[tool.slug] ?? 0) >= FREE_USES_PER_TOOL) {
    return Response.json(
      { error: "Sign in with Google to keep using this tool. It stays free.", code: "signin_required", remaining: remainingFor(usage) },
      { status: 401 },
    );
  }

  try {
    const result = await runTool(tool.slug, parsed.data as never);
    let remaining = null;
    if (!user) {
      // Only successful runs count against the free allowance.
      usage[tool.slug] = (usage[tool.slug] ?? 0) + 1;
      await writeUsage(usage);
      remaining = remainingFor(usage);
    }
    return Response.json({ result, remaining });
  } catch (err) {
    if (err instanceof GenerationError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error(`Tool ${tool.slug} failed:`, err);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
