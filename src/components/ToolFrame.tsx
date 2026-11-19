"use client";

import { useCallback, useState } from "react";
import { FREE_USES_PER_TOOL, getTool, type ToolSlug } from "@/lib/tools";
import { useApp } from "./AppProvider";
import { GoogleMark } from "./Shell";

type State<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: T }
  | { status: "error"; error: string };

export function useTool<T>(slug: ToolSlug) {
  const { setRemaining } = useApp();
  const [state, setState] = useState<State<T>>({ status: "idle" });

  const run = useCallback(
    async (input: Record<string, unknown>) => {
      setState({ status: "loading" });
      try {
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
      } catch {
        setState({ status: "error", error: "Network problem. Check your connection and try again." });
      }
    },
    [slug, setRemaining],
  );

  return { state, run };
}

export function ToolFrame<T>({
  slug,
  state,
  onSubmit,
  cta,
  wait = "This usually takes 15 to 40 seconds.",
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
  const { ready, user, remaining, signIn } = useApp();
  const left = user ? null : (remaining?.[slug] ?? FREE_USES_PER_TOOL);
  const gated = ready && left === 0;
  const loading = state.status === "loading";

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tool.name}</h1>
      <p className="mt-2 max-w-xl text-mute">{tool.tagline}</p>

      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading && !gated) onSubmit();
        }}
      >
        {children}

        {gated ? (
          <div className="rounded-2xl border border-lime/40 bg-lime/5 p-5">
            <p className="font-medium">You have used your {FREE_USES_PER_TOOL} free runs of {tool.name}.</p>
            <p className="mt-1 text-sm text-mute">Sign in with Google to keep going. DoShorts stays free.</p>
            <button
              type="button"
              onClick={signIn}
              className="mt-4 flex items-center gap-2.5 rounded-full bg-text px-5 py-2.5 text-sm font-semibold text-ink hover:bg-white"
            >
              <GoogleMark /> Continue with Google
            </button>
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
                {left} of {FREE_USES_PER_TOOL} free runs left, then sign in with Google.
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
