// Model providers. Isomorphic: in the browser this talks to the provider directly,
// so a user's key and prompts never pass through the DoShorts server.
import { z } from "zod";
import { GenerationError } from "./errors";

export type AiConfig = {
  kind: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type Preset = {
  id: string;
  name: string;
  kind: AiConfig["kind"];
  baseUrl: string;
  /** Runs on the user's own machine. */
  local: boolean;
  needsKey: boolean;
  /** The user may point this preset at a different address. */
  editableUrl: boolean;
  defaultModel?: string;
  keyHint?: string;
};

export const PRESETS: Preset[] = [
  { id: "ollama", name: "Ollama", kind: "openai", baseUrl: "http://localhost:11434/v1", local: true, needsKey: false, editableUrl: true },
  { id: "lmstudio", name: "LM Studio", kind: "openai", baseUrl: "http://localhost:1234/v1", local: true, needsKey: false, editableUrl: true },
  { id: "openai", name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", local: false, needsKey: true, editableUrl: false, keyHint: "sk-…" },
  { id: "anthropic", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", local: false, needsKey: true, editableUrl: false, defaultModel: "claude-opus-5-5", keyHint: "sk-ant-…" },
  { id: "openrouter", name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", local: false, needsKey: true, editableUrl: false, keyHint: "sk-or-…" },
  { id: "custom", name: "Custom (OpenAI-compatible)", kind: "openai", baseUrl: "", local: false, needsKey: false, editableUrl: true },
];

export const getPreset = (id: string) => PRESETS.find((p) => p.id === id);

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validates the endpoint and refuses to send a key anywhere it could be read in transit. */
function endpoint(config: AiConfig, path: string): URL {
  let base: URL;
  try {
    base = new URL(config.baseUrl);
  } catch {
    throw new GenerationError("The AI address is not a valid URL.", 400);
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") {
    throw new GenerationError("The AI address must start with http:// or https://.", 400);
  }
  if (base.username || base.password) {
    throw new GenerationError("Do not put credentials in the AI address. Use the API key field.", 400);
  }
  if (config.apiKey && base.protocol === "http:" && !LOOPBACK.has(base.hostname)) {
    throw new GenerationError(
      "Refusing to send an API key over unencrypted http. Use an https address, or remove the key.",
      400,
    );
  }
  return new URL(base.pathname.replace(/\/+$/, "") + path, base);
}

async function request(config: AiConfig, path: string, body?: unknown): Promise<Response> {
  const url = endpoint(config, path);
  try {
    return await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // Never follow a redirect with the key attached, never attach cookies, never leak the page URL.
      redirect: "error",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  } catch {
    throw new GenerationError(
      `Could not reach ${url.host}. Check that it is running and that it accepts requests from this site.`,
      503,
    );
  }
}

function fail(status: number): never {
  if (status === 401 || status === 403) throw new GenerationError("The provider rejected the API key.", 401);
  if (status === 404) throw new GenerationError("Model or endpoint not found. Check the address and the model name.", 404);
  if (status === 429) throw new GenerationError("The provider is rate limiting you or your quota is used up.", 429);
  throw new GenerationError(`The provider returned an error (HTTP ${status}).`, 502);
}

/** Pulls the JSON object out of a model reply, tolerating reasoning tags and code fences. */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const BAD_SHAPE =
  "The model's reply did not match the expected format. Try again; small models can struggle here, so a larger one may help.";

async function openaiCompatible<S extends z.ZodType>(
  config: AiConfig,
  req: { system: string; prompt: string; schema: S },
): Promise<z.infer<S>> {
  const { $schema: _omit, ...schema } = z.toJSONSchema(req.schema) as Record<string, unknown>;
  void _omit;
  const body: Record<string, unknown> = {
    model: config.model,
    stream: false,
    messages: [
      { role: "system", content: req.system },
      {
        role: "user",
        content: `${req.prompt}\n\nReply with a single JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(schema)}`,
      },
    ],
    // Local runtimes turn this into constrained decoding, which guarantees the shape.
    response_format: { type: "json_schema", json_schema: { name: "result", strict: true, schema } },
  };

  let res = await request(config, "/chat/completions", body);
  if (res.status === 400 || res.status === 422) {
    // Endpoint does not support structured outputs: rely on the instruction in the prompt.
    delete body.response_format;
    res = await request(config, "/chat/completions", body);
  }
  if (!res.ok) fail(res.status);

  const json = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  } | null;
  const content = json?.choices?.[0]?.message?.content;
  const text = Array.isArray(content) ? content.map((c) => c.text ?? "").join("") : (content ?? "");
  try {
    return req.schema.parse(extractJson(text));
  } catch {
    throw new GenerationError(BAD_SHAPE, 502);
  }
}

// Browser-only path: the Anthropic SDK is loaded on demand and calls the API directly with the user's key.
async function anthropicDirect<S extends z.ZodType>(
  config: AiConfig,
  req: { system: string; prompt: string; schema: S },
): Promise<z.infer<S>> {
  const [{ default: Anthropic }, { zodOutputFormat }] = await Promise.all([
    import("@anthropic-ai/sdk"),
    import("@anthropic-ai/sdk/helpers/zod"),
  ]);
  const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
  try {
    const res = await client.messages.parse({
      model: config.model,
      max_tokens: 16000,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      output_config: { format: zodOutputFormat(req.schema) },
    });
    if (res.stop_reason === "refusal") {
      throw new GenerationError("The model declined this request. Try rephrasing the input.", 422);
    }
    if (res.parsed_output == null) throw new GenerationError(BAD_SHAPE, 502);
    return res.parsed_output;
  } catch (err) {
    if (err instanceof GenerationError) throw err;
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) fail(401);
    if (err instanceof Anthropic.NotFoundError) fail(404);
    if (err instanceof Anthropic.RateLimitError) fail(429);
    if (err instanceof Anthropic.APIConnectionError) {
      throw new GenerationError("Could not reach Anthropic. Check your connection.", 503);
    }
    if (err instanceof Anthropic.APIError) fail(err.status ?? 502);
    throw new GenerationError(BAD_SHAPE, 502);
  }
}

export function generateWith<S extends z.ZodType>(
  config: AiConfig,
  req: { system: string; prompt: string; schema: S },
): Promise<z.infer<S>> {
  if (!config.model) throw new GenerationError("Choose a model first.", 400);
  return config.kind === "anthropic" ? anthropicDirect(config, req) : openaiCompatible(config, req);
}

/** Lists the models the endpoint offers. Doubles as the connection test. */
export async function listModels(config: AiConfig): Promise<string[]> {
  if (config.kind === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl, dangerouslyAllowBrowser: true });
    try {
      const ids: string[] = [];
      for await (const m of client.models.list()) ids.push(m.id);
      return ids;
    } catch (err) {
      if (err instanceof Anthropic.APIConnectionError) {
        throw new GenerationError("Could not reach Anthropic. Check your connection.", 503);
      }
      if (err instanceof Anthropic.APIError) fail(err.status ?? 502);
      throw new GenerationError("Could not list models.", 502);
    }
  }
  const res = await request(config, "/models");
  if (!res.ok) fail(res.status);
  const json = (await res.json().catch(() => null)) as { data?: { id: string }[] } | null;
  return (json?.data ?? []).map((m) => m.id).filter(Boolean).sort();
}
