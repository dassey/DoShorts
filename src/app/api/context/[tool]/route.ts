import { gatherContext } from "@/lib/context";
import { GenerationError } from "@/lib/errors";
import { needsContext } from "@/lib/prompts";
import { inputs } from "@/lib/schemas";
import { getTool } from "@/lib/tools";

// Public YouTube data for people running a tool on their own AI. The browser
// cannot fetch it directly, so the server does. No model call, no secrets in or out.
export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const tool = getTool((await params).tool);
  if (!tool || !needsContext(tool.slug)) return Response.json({ error: "Unknown tool." }, { status: 404 });

  const parsed = inputs[tool.slug].safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Check the form and try again." }, { status: 400 });

  try {
    return Response.json(await gatherContext(tool.slug, parsed.data as never));
  } catch (err) {
    if (err instanceof GenerationError) return Response.json({ error: err.message }, { status: err.status });
    console.error(`Context for ${tool.slug} failed:`, err);
    return Response.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
