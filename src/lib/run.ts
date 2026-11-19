import { generate } from "./claude";
import { gatherContext } from "./context";
import { buildPrompt, finalize, SYSTEM, type ToolInput } from "./prompts";
import { generateWith } from "./providers";
import { outputs } from "./schemas";
import type { ToolSlug } from "./tools";

// The built-in AI is whatever the deployer configured:
//   DOSHORTS_BASE_URL (+ DOSHORTS_MODEL, optional DOSHORTS_API_KEY): any OpenAI-compatible
//     endpoint, including a local one such as Ollama
//   otherwise ANTHROPIC_API_KEY: Claude
// With neither, there is no built-in AI and users bring their own.
const customBase = () => process.env.DOSHORTS_BASE_URL;

export const hostedAvailable = () => Boolean(customBase() || process.env.ANTHROPIC_API_KEY);

/** Runs a tool on the built-in AI. */
export async function runTool<K extends ToolSlug>(slug: K, input: ToolInput<K>): Promise<unknown> {
  const ctx = await gatherContext(slug, input);
  const schema = outputs[slug];

  if (customBase()) {
    const data = await generateWith(
      {
        kind: "openai",
        baseUrl: customBase()!,
        model: process.env.DOSHORTS_MODEL ?? "",
        apiKey: process.env.DOSHORTS_API_KEY,
      },
      { system: SYSTEM, prompt: buildPrompt(slug, input, ctx), schema },
    );
    return finalize(slug, data as never, ctx);
  }

  const webSearch = slug === "trends" && process.env.DOSHORTS_WEB_SEARCH !== "0";
  const { data, sources } = await generate({
    schema,
    webSearch,
    prompt: buildPrompt(slug, input, ctx, { webSearch }),
  });
  return finalize(slug, data as never, ctx, sources);
}
