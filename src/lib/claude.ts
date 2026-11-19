import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { GenerationError } from "./errors";
import { SYSTEM } from "./prompts";

const MODEL = process.env.DOSHORTS_MODEL || "claude-opus-5-5";
const EFFORT = (process.env.DOSHORTS_EFFORT || "low") as "low" | "medium" | "high";

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic());

export type WebSource = { title: string; url: string };

/** One structured generation. With `webSearch`, Claude may search the web first. */
export async function generate<S extends z.ZodType>(opts: {
  schema: S;
  prompt: string;
  webSearch?: boolean;
}): Promise<{ data: z.infer<S>; sources: WebSource[] }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const sources: WebSource[] = [];

  try {
    // A web-search turn can pause; re-sending the assistant turn resumes it.
    for (let turn = 0; turn < 4; turn++) {
      const res = await anthropic().beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: EFFORT, format: betaZodOutputFormat(opts.schema) },
        ...(opts.webSearch
          ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 4 }] }
          : {}),
      });

      for (const block of res.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) sources.push({ title: r.title, url: r.url });
        }
      }

      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }
      if (res.stop_reason === "refusal") {
        throw new GenerationError("The model declined this request. Try rephrasing the input.", 422);
      }
      if (res.stop_reason === "max_tokens" || res.parsed_output == null) {
        throw new GenerationError("The response was incomplete. Try again.", 502);
      }
      return { data: res.parsed_output, sources };
    }
    throw new GenerationError("The request took too many steps. Try again.", 504);
  } catch (err) {
    if (err instanceof GenerationError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("Anthropic credentials rejected:", err.message);
      throw new GenerationError("The AI service is not configured. Set ANTHROPIC_API_KEY.", 500);
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new GenerationError("Busy right now. Try again in a moment.", 429);
    }
    if (err instanceof Anthropic.BadRequestError) {
      console.error("Anthropic rejected the request:", err.message);
      throw new GenerationError("The AI service rejected the request.", 502);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new GenerationError("Could not reach the AI service. Try again.", 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err.status, err.message);
      throw new GenerationError("The AI service had a problem. Try again.", 502);
    }
    console.error("Generation failed:", err);
    // The SDK throws a plain AnthropicError when it finds no credentials at all.
    if (err instanceof Anthropic.AnthropicError && /api[ _-]?key|auth|credential/i.test(err.message)) {
      throw new GenerationError("The AI service is not configured. Set ANTHROPIC_API_KEY.", 500);
    }
    // Anything else here is a response that did not match the expected shape.
    throw new GenerationError("The response could not be read. Try again.", 502);
  }
}
