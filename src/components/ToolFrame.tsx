"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { GenerationError } from "@/lib/errors";
import { buildPrompt, finalize, needsContext, SYSTEM, type ToolContext } from "@/lib/prompts";
import { keyring } from "@/lib/keyring";
import type { AiConfig } from "@/lib/providers";
import { inputs } from "@/lib/schemas";
import { FREE_USES_PER_TOOL, getTool, type ToolSlug } from "@/lib/tools";
import { useAi } from "./AiProvider";
import { useApp } from "./AppProvider";
import { GoogleMark } from "./Shell";

type State<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: T }
  | { status: "error"; error: string };

/**
 * Runs a tool on the user's own AI. The keyring worker makes the model call,
 * from this browser straight to the provider, attaching the key itself.
 */
async function runOnOwnAi(slug: ToolSlug, raw: Record<string, unknown>, preset: string, config: AiConfig): Promise<unknown> {
  const parsed = inputs[slug].safeParse(raw);
  if (!parsed.success) throw new GenerationError("Check the form and try again.", 400);

  let ctx: ToolContext = {};
  if (needsContext(slug)) {
    // Public YouTube data only. The key and the model call are not involved.
    const res = await fetch(`/api/context/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new GenerationError(data.error ?? "Could not load the video data.", res.status);
    ctx = data;
  }

  const data = await keyring<unknown>({
    op: "generate",
    preset,
    kind: config.kind,
    baseUrl: config.baseUrl,
    model: config.model,
    slug,
    system: SYSTEM,
    prompt: buildPrompt(slug, parsed.data as never, ctx),
  });
  return finalize(slug, data as never, ctx);
}

export function useTool<T>(slug: ToolSlug) {
  const { setRemaining } = useApp();
  const { active } = useAi();
  const [state, setState] = useState<State<T>>({ status: "idle" });

  const run = useCallback(
    async (input: Record<string, unknown>) => {
      if (!active) return;
      setState({ status: "loading" });
      try {
        if (active.type === "own") {
          setState({ status: "done", result: (await runOnOwnAi(slug, input, active.preset.id, active.config)) as T });
          return;
        }
        const res = await fetch(`/api/tools/${slug}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.code === "signin_required") {
            // The server is the source of truth for the allowance; the form shows the sign-in prompt.
            setRemaining(data.remaining);
            setState({ status: "idle" });
            return;
          }
          setState({ status: "error", error: data.error ?? "Something went wrong. Try again." });
          return;
        }
        if (data.remaining) setRemaining(data.remaining);
        setState({ status: "done", result: data.result as T });
      } catch (err) {
        setState({
          status: "error",
          error:
            err instanceof GenerationError
              ? err.message
              : "Network problem. Check your connection and try again.",
        });
      }
    },
    [slug, active, setRemaining],
  );

  return { state, run };
}

export function ToolFrame<T>({
  slug,
  state,
  onSubmit,
  cta,
  wait: hostedWait = "This usually takes 15 to 40 seconds.",
  children,
  render,
}: {
  slug: ToolSlug;
  state: State<T>;
  onSubmit: () => void;
  cta: string;
  wait?: string;
  children: React.ReactNode;
  render: (result: T) => React.ReactNode;
}) {
  const tool = getTool(slug)!;
  const { user, remaining, authEnabled, signIn } = useApp();
  const { loaded, active, missing } = useAi();
  const ready = loaded;
  const own = active?.type === "own" ? active : null;
  // The free-run allowance only applies to the built-in AI.
  const left = active?.type !== "hosted" || user ? null : (remaining?.[slug] ?? FREE_USES_PER_TOOL);
  const gated = ready && left === 0;
  const unset = ready && !active;
  const wait = own?.preset.local ? "Running on your machine. Local models can take a few minutes." : hostedWait;
  const loading = state.status === "loading";

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tool.name}</h1>
      <p className="mt-2 max-w-xl text-mute">{tool.tagline}</p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading && !gated && !unset) onSubmit();
        }}
      >
        {children}

        {unset ? (
          <div className="rounded-2xl border border-lime/40 bg-lime/5 p-5">
            <p className="font-medium">{missing ?? "Choose the AI that runs DoShorts."}</p>
            <p className="mt-1 text-sm text-mute">
              Use a local model with Ollama or LM Studio, or your own key for a hosted one. Your key stays in this browser.
            </p>
            <Link
              href="/settings"
              className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-90"
            >
              Open AI settings
            </Link>
          </div>
        ) : gated ? (
          <div className="rounded-2xl border border-lime/40 bg-lime/5 p-5">
            <p className="font-medium">You have used your {FREE_USES_PER_TOOL} free runs of {tool.name}.</p>
            <p className="mt-1 text-sm text-mute">
              {authEnabled ? "Sign in with Google to keep going, or " : "To keep going, "}
              <Link href="/settings" className="underline underline-offset-4 hover:text-text">
                use your own AI
              </Link>{" "}
              with no limit and no account.
            </p>
            {authEnabled && (
              <button
                type="button"
                onClick={signIn}
                className="mt-4 flex items-center gap-2.5 rounded-full bg-text px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white"
              >
                <GoogleMark /> Continue with Google
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Working…" : cta}
            </button>
            {ready && left != null && (
              <p className="text-sm text-mute">
                {left} of {FREE_USES_PER_TOOL} free runs left{authEnabled ? ", then sign in with Google" : ""}.
              </p>
            )}
            {own && (
              <p className="text-sm text-mute">
                Runs on{" "}
                <Link href="/settings" className="text-text underline-offset-4 hover:underline">
                  {own.preset.name} · {own.config.model}
                </Link>
                {own.preset.local ? ", on your machine." : ", with your key."}
              </p>
            )}
          </div>
        )}
      </form>

      <div className="mt-10" aria-live="polite">
        {loading && (
          <div>
            <p className="mb-4 text-sm text-mute">{wait}</p>
            <div className="space-y-3">
              {[72, 100, 88, 94, 60].map((w, i) => (
                <div
                  key={i}
                  className="h-12 animate-pulse rounded-2xl bg-panel"
                  style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        {state.status === "error" && (
          <p role="alert" className="rounded-2xl border border-hot/40 bg-hot/10 px-4 py-3 text-sm">
            {state.error}
          </p>
        )}
        {state.status === "done" && <div className="space-y-10">{render(state.result)}</div>}
      </div>
    </div>
  );
}
