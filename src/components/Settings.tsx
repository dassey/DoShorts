"use client";

import { useState } from "react";
import { GenerationError } from "@/lib/errors";
import { PRESETS, getPreset, listModels } from "@/lib/providers";
import { HOSTED, useAi } from "./AiProvider";
import { useApp } from "./AppProvider";
import { Field, inputClass } from "./ui";

type Check = { status: "idle" | "busy" } | { status: "ok"; models: string[] } | { status: "error"; error: string };

function Choice({
  selected,
  onSelect,
  name,
  note,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  note: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 has-focus-visible:outline-2 has-focus-visible:outline-lime ${
        selected ? "border-lime bg-lime/10" : "border-line bg-panel hover:border-mute/60"
      }`}
    >
      <input type="radio" name="ai" className="sr-only" checked={selected} onChange={onSelect} />
      <span className="font-medium">{name}</span>
      <span className={`text-xs ${selected ? "text-lime" : "text-mute"}`}>{note}</span>
    </label>
  );
}

export function Settings() {
  const { hosted } = useApp();
  const ai = useAi();
  const [check, setCheck] = useState<Check>({ status: "idle" });

  const preset = ai.choice && ai.choice !== HOSTED ? getPreset(ai.choice) : undefined;
  const s = preset ? ai.settings(preset.id) : null;
  const key = preset ? ai.keyFor(preset.id) : "";
  const models = check.status === "ok" ? check.models : [];

  const select = (id: string) => {
    ai.choose(id);
    setCheck({ status: "idle" });
  };

  async function test() {
    if (!preset || !s) return;
    setCheck({ status: "busy" });
    try {
      const found = await listModels({ kind: preset.kind, baseUrl: s.baseUrl, model: s.model, apiKey: key || undefined });
      setCheck({ status: "ok", models: found });
      if (!s.model && found.length === 1) ai.update(preset.id, { model: found[0] });
    } catch (err) {
      setCheck({
        status: "error",
        error: err instanceof GenerationError ? err.message : "Could not connect.",
      });
    }
  }

  // Settings come from this browser's storage, so there is nothing to render until they load.
  if (!ai.loaded) return null;
  const origin = window.location.origin;

  return (
    <div className="max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">AI settings</h1>
      <p className="mt-2 max-w-xl text-mute">
        Choose the AI that runs every tool. With your own AI, requests go from this browser straight to it. DoShorts
        servers never see your key or your prompts.
      </p>

      <fieldset className="mt-8">
        <legend className="mb-2 text-sm font-semibold tracking-wide text-mute uppercase">On your machine</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.filter((p) => p.local).map((p) => (
            <Choice key={p.id} name={p.name} note="Local, no key" selected={ai.choice === p.id} onSelect={() => select(p.id)} />
          ))}
        </div>
        <p className="mt-6 mb-2 text-sm font-semibold tracking-wide text-mute uppercase">With your own key</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.filter((p) => !p.local).map((p) => (
            <Choice
              key={p.id}
              name={p.name}
              note={p.id === "custom" ? "Any address" : "Your key"}
              selected={ai.choice === p.id}
              onSelect={() => select(p.id)}
            />
          ))}
        </div>
        {hosted && (
          <>
            <p className="mt-6 mb-2 text-sm font-semibold tracking-wide text-mute uppercase">No setup</p>
            <Choice name="Built-in AI" note="Free runs, then sign in" selected={ai.choice === HOSTED} onSelect={() => select(HOSTED)} />
          </>
        )}
      </fieldset>

      {preset && s && (
        <div className="mt-8 space-y-4 rounded-2xl border border-line bg-panel p-5">
          <h2 className="text-lg font-semibold">{preset.name}</h2>

          {preset.editableUrl && (
            <Field label="Address" hint="the OpenAI-compatible base URL, usually ending in /v1">
              <input
                className={inputClass}
                value={s.baseUrl}
                onChange={(e) => ai.update(preset.id, { baseUrl: e.target.value.trim() })}
                placeholder="http://localhost:8080/v1"
                inputMode="url"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
          )}

          {(preset.needsKey || preset.id === "custom") && (
            <div>
              <Field label="API key" hint={preset.needsKey ? undefined : "optional"}>
                <input
                  className={`${inputClass} font-mono`}
                  type="password"
                  value={key}
                  onChange={(e) => ai.setKey(preset.id, e.target.value.trim())}
                  placeholder={preset.keyHint ?? "Leave empty if the endpoint needs none"}
                  spellCheck={false}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                />
              </Field>
              <label className="mt-2.5 flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-lime"
                  checked={s.remember}
                  onChange={(e) => ai.update(preset.id, { remember: e.target.checked })}
                />
                <span>
                  Remember this key on this device
                  <span className="block text-mute">
                    {s.remember
                      ? "Stored encrypted in this browser. Untick to erase it."
                      : "Off: the key is kept in memory only and is gone when you close or reload the tab."}
                  </span>
                </span>
              </label>
            </div>
          )}

          <Field label="Model" hint={models.length ? `${models.length} available` : "type a name, or connect to list them"}>
            <input
              className={`${inputClass} font-mono`}
              value={s.model}
              onChange={(e) => ai.update(preset.id, { model: e.target.value.trim() })}
              placeholder={preset.local ? "the model you have pulled" : "model id"}
              list="ds-models"
              spellCheck={false}
              autoComplete="off"
            />
            <datalist id="ds-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>

          {models.length > 0 && models.length <= 24 && (
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => ai.update(preset.id, { model: m })}
                  className={`rounded-full border px-3 py-1 font-mono text-xs ${
                    s.model === m ? "border-lime text-lime" : "border-line text-mute hover:border-mute hover:text-text"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
            <button
              type="button"
              onClick={test}
              disabled={check.status === "busy" || !s.baseUrl}
              className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
            >
              {check.status === "busy" ? "Connecting…" : "Test connection"}
            </button>
            <p className="text-sm" aria-live="polite">
              {check.status === "ok" && <span className="text-lime">Connected. {check.models.length} models found.</span>}
              {check.status === "error" && <span className="text-hot">{check.error}</span>}
              {check.status === "idle" && ai.missing && <span className="text-amber">{ai.missing}</span>}
              {check.status === "idle" && ai.active?.type === "own" && <span className="text-mute">Ready. Saved automatically.</span>}
            </p>
          </div>

          {preset.local && (
            <p className="border-t border-line pt-4 text-sm leading-relaxed text-mute">
              {preset.id === "ollama" ? (
                <>
                  Ollama only answers pages it trusts. If the connection fails, start it with{" "}
                  <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-text">
                    OLLAMA_ORIGINS={origin} ollama serve
                  </code>
                  .
                </>
              ) : (
                <>If the connection fails, turn on CORS in the LM Studio server settings.</>
              )}{" "}
              Your browser may also ask for permission to reach devices on your local network.
            </p>
          )}
        </div>
      )}

      <section className="mt-10 text-sm leading-relaxed text-mute">
        <h2 className="mb-2 font-semibold tracking-wide uppercase">How your key is handled</h2>
        <ul className="space-y-1.5">
          <li>It is sent only to the provider you chose, over https (or to your own machine). Never to DoShorts.</li>
          <li>It is never written to a URL, a cookie, a log or plain browser storage.</li>
          <li>It lives in memory unless you tick Remember, which stores it encrypted in this browser only.</li>
          <li>This page loads no third-party scripts.</li>
        </ul>
      </section>
    </div>
  );
}
