// The keyring: the only place a user's API key exists after it is typed.
//
// It runs in a dedicated worker, which has its own memory. Scripts in the page
// cannot read it. They can only send the requests below, and none of them
// returns key material. The worker makes the provider calls itself.
//
// Inside the worker a key is never held whole. It is split into random XOR
// shares that are re-randomised after every use, and it is bound to the origin
// it was entered for: the worker will not send it anywhere else, whatever
// address a request names.

import { GenerationError } from "./errors";
import { generateWith, listModels, type AiConfig } from "./providers";
import { outputs } from "./schemas";
import type { ToolSlug } from "./tools";
import { forgetKey, loadKey, saveKey } from "./vault";

export type KeyringRequest =
  | { op: "set"; preset: string; baseUrl: string; key: string; remember: boolean }
  | { op: "clear"; preset: string }
  | { op: "remember"; preset: string; on: boolean }
  | { op: "restore"; presets: string[] }
  | { op: "models"; preset: string; kind: AiConfig["kind"]; baseUrl: string }
  | { op: "generate"; preset: string; kind: AiConfig["kind"]; baseUrl: string; model: string; slug: ToolSlug; system: string; prompt: string };

/** Which presets hold a key, and the origin each is bound to. Never the key. */
export type KeyStatus = Record<string, string>;

const SHARES = 3;
type Held = { origin: string; shares: Uint8Array<ArrayBuffer>[] };
const held = new Map<string, Held>();

function split(secret: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] {
  const shares = Array.from({ length: SHARES - 1 }, () => crypto.getRandomValues(new Uint8Array(secret.length)));
  const last = new Uint8Array(secret);
  for (const share of shares) for (let i = 0; i < last.length; i++) last[i] ^= share[i];
  return [...shares, last];
}

function join(shares: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(shares[0].length);
  for (const share of shares) for (let i = 0; i < out.length; i++) out[i] ^= share[i];
  return out;
}

function store(preset: string, secret: string, origin: string) {
  const bytes = new TextEncoder().encode(secret);
  held.set(preset, { origin, shares: split(bytes) });
  bytes.fill(0);
}

/** Runs `run` with the key assembled, then wipes the assembled bytes and reshuffles the shares. */
async function withKey<T>(preset: string, baseUrl: string, run: (apiKey: string | undefined) => Promise<T>): Promise<T> {
  const entry = held.get(preset);
  if (!entry) return run(undefined);
  if (originOf(baseUrl) !== entry.origin) {
    throw new GenerationError("The address changed since this key was entered. Enter the key again to use it there.", 400);
  }
  const bytes = join(entry.shares);
  try {
    return await run(new TextDecoder().decode(bytes));
  } finally {
    entry.shares.forEach((s) => s.fill(0));
    entry.shares = split(bytes);
    bytes.fill(0);
  }
}

function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    throw new GenerationError("The AI address is not a valid URL.", 400);
  }
}

const status = (): KeyStatus => Object.fromEntries([...held].map(([preset, h]) => [preset, h.origin]));

async function handle(req: KeyringRequest): Promise<unknown> {
  switch (req.op) {
    case "set": {
      const origin = originOf(req.baseUrl);
      store(req.preset, req.key, origin);
      if (req.remember) await saveKey(req.preset, req.key, origin);
      return status();
    }
    case "clear":
      held.get(req.preset)?.shares.forEach((s) => s.fill(0));
      held.delete(req.preset);
      await forgetKey(req.preset);
      return status();
    case "remember": {
      const entry = held.get(req.preset);
      if (req.on && entry) {
        const bytes = join(entry.shares);
        await saveKey(req.preset, new TextDecoder().decode(bytes), entry.origin);
        bytes.fill(0);
      }
      if (!req.on) await forgetKey(req.preset);
      return status();
    }
    case "restore":
      for (const preset of req.presets) {
        const saved = await loadKey(preset);
        if (saved) store(preset, saved.secret, saved.origin);
      }
      return status();
    case "models":
      return withKey(req.preset, req.baseUrl, (apiKey) =>
        listModels({ kind: req.kind, baseUrl: req.baseUrl, model: "", apiKey }),
      );
    case "generate":
      return withKey(req.preset, req.baseUrl, (apiKey) =>
        generateWith(
          { kind: req.kind, baseUrl: req.baseUrl, model: req.model, apiKey },
          { system: req.system, prompt: req.prompt, schema: outputs[req.slug] },
        ),
      );
  }
}

addEventListener("message", async (event: MessageEvent<{ id: number; req: KeyringRequest }>) => {
  const { id, req } = event.data;
  const reply = (msg: unknown) => (self as unknown as Worker).postMessage(msg);
  try {
    reply({ id, ok: true, value: await handle(req) });
  } catch (err) {
    // Only ever a message written for the user. Never an underlying error, which could echo a request.
    const known = err instanceof GenerationError;
    reply({ id, ok: false, message: known ? err.message : "Something went wrong talking to the AI.", status: known ? err.status : 500 });
  }
});
