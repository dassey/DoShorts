"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PRESETS, getPreset, type AiConfig, type Preset } from "@/lib/providers";
import { forgetKey, loadKey, saveKey } from "@/lib/vault";
import { useApp } from "./AppProvider";

// Which AI runs the tools. Non-secret settings (address, model) live in
// localStorage. API keys never do: they stay in memory, and are written to the
// encrypted vault only when the user asks for them to be remembered.

const STORAGE = "ds_ai";
export const HOSTED = "hosted";

type PresetSettings = { baseUrl: string; model: string; remember: boolean };
type Saved = { choice: string | null; byPreset: Record<string, PresetSettings> };

export type ActiveAi =
  | { type: "hosted" }
  | { type: "own"; preset: Preset; config: AiConfig }
  | null;

type AiState = {
  loaded: boolean;
  choice: string | null;
  choose: (id: string) => void;
  settings: (id: string) => PresetSettings;
  update: (id: string, patch: Partial<PresetSettings>) => void;
  keyFor: (id: string) => string;
  setKey: (id: string, key: string) => void;
  /** The AI that will run the next tool, or null if none is ready. */
  active: ActiveAi;
  /** Why `active` is null, when a choice has been made but is incomplete. */
  missing: string | null;
};

const Ctx = createContext<AiState | null>(null);

const defaults = (id: string): PresetSettings => {
  const p = getPreset(id);
  return { baseUrl: p?.baseUrl ?? "", model: p?.defaultModel ?? "", remember: false };
};

export function AiProvider({ children }: { children: React.ReactNode }) {
  const { ready, hosted } = useApp();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Saved>({ choice: null, byPreset: {} });
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    (async () => {
      let stored: Saved = { choice: null, byPreset: {} };
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
        if (raw && typeof raw === "object") stored = { choice: raw.choice ?? null, byPreset: raw.byPreset ?? {} };
      } catch {
        // unreadable settings: start fresh
      }
      const remembered: Record<string, string> = {};
      await Promise.all(
        PRESETS.filter((p) => stored.byPreset[p.id]?.remember).map(async (p) => {
          const key = await loadKey(p.id);
          if (key) remembered[p.id] = key;
        }),
      );
      if (!live) return;
      setSaved(stored);
      setKeys(remembered);
      setLoaded(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  const persist = useCallback((next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      // storage unavailable: settings last for this visit only
    }
  }, []);

  const settings = useCallback((id: string) => ({ ...defaults(id), ...saved.byPreset[id] }), [saved]);

  const choose = useCallback((id: string) => persist({ ...saved, choice: id }), [saved, persist]);

  const update = useCallback(
    (id: string, patch: Partial<PresetSettings>) => {
      const next = { ...defaults(id), ...saved.byPreset[id], ...patch };
      persist({ ...saved, byPreset: { ...saved.byPreset, [id]: next } });
      if (patch.remember === true && keys[id]) void saveKey(id, keys[id]);
      if (patch.remember === false) void forgetKey(id);
    },
    [saved, keys, persist],
  );

  const setKey = useCallback(
    (id: string, key: string) => {
      setKeys((k) => ({ ...k, [id]: key }));
      if (!settings(id).remember) return;
      if (key) void saveKey(id, key);
      else void forgetKey(id);
    },
    [settings],
  );

  const keyFor = useCallback((id: string) => keys[id] ?? "", [keys]);

  const { active, missing } = useMemo((): { active: ActiveAi; missing: string | null } => {
    if (!loaded || !ready) return { active: null, missing: null };
    const choice = saved.choice ?? (hosted ? HOSTED : null);
    if (choice === HOSTED) return hosted ? { active: { type: "hosted" }, missing: null } : { active: null, missing: null };
    const preset = choice ? getPreset(choice) : undefined;
    if (!preset) return { active: null, missing: null };
    const s = settings(preset.id);
    const apiKey = keys[preset.id] || undefined;
    if (!s.baseUrl) return { active: null, missing: `Add the address for ${preset.name}.` };
    if (!s.model) return { active: null, missing: `Choose a model for ${preset.name}.` };
    if (preset.needsKey && !apiKey) return { active: null, missing: `Enter your ${preset.name} API key.` };
    return {
      active: { type: "own", preset, config: { kind: preset.kind, baseUrl: s.baseUrl, model: s.model, apiKey } },
      missing: null,
    };
  }, [loaded, ready, hosted, saved, keys, settings]);

  const value = useMemo(
    () => ({ loaded: loaded && ready, choice: saved.choice ?? (hosted ? HOSTED : null), choose, settings, update, keyFor, setKey, active, missing }),
    [loaded, ready, hosted, saved.choice, choose, settings, update, keyFor, setKey, active, missing],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAi must be used inside AiProvider");
  return v;
}
