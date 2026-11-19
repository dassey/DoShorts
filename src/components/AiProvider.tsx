"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { PRESETS, getPreset, type AiConfig, type Preset } from "@/lib/providers";
import { keyring, type KeyStatus } from "@/lib/keyring";
import { useApp } from "./AppProvider";

// Which AI runs the tools. Non-secret settings (address, model) live in
// localStorage. API keys are handed straight to the keyring worker and are not
// kept anywhere in the page: this component only knows whether a key is set.

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
  hasKey: (id: string) => boolean;
  /** Hands the key to the keyring. The caller must not keep its own copy. */
  setKey: (id: string, key: string) => Promise<void>;
  clearKey: (id: string) => void;
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
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({});

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
      const remembered = PRESETS.filter((p) => stored.byPreset[p.id]?.remember).map((p) => p.id);
      const status = await keyring({ op: "restore", presets: remembered }).catch(() => ({}));
      if (!live) return;
      setSaved(stored);
      setKeyStatus(status);
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

  const clearKey = useCallback((id: string) => {
    void keyring({ op: "clear", preset: id }).then(setKeyStatus);
  }, []);

  const update = useCallback(
    (id: string, patch: Partial<PresetSettings>) => {
      const next = { ...defaults(id), ...saved.byPreset[id], ...patch };
      persist({ ...saved, byPreset: { ...saved.byPreset, [id]: next } });
      if (patch.remember !== undefined) void keyring({ op: "remember", preset: id, on: patch.remember });
      // A key belongs to the address it was entered for. Point the preset elsewhere and the key goes.
      if (patch.baseUrl !== undefined && id in keyStatus) {
        let origin = "";
        try {
          origin = new URL(patch.baseUrl).origin;
        } catch {
          // not a URL yet
        }
        if (origin !== keyStatus[id]) clearKey(id);
      }
    },
    [saved, keyStatus, persist, clearKey],
  );

  const setKey = useCallback(
    async (id: string, key: string) => {
      const { baseUrl, remember } = settings(id);
      setKeyStatus(await keyring({ op: "set", preset: id, baseUrl, key, remember }));
    },
    [settings],
  );

  const hasKey = useCallback((id: string) => id in keyStatus, [keyStatus]);

  const { active, missing } = useMemo((): { active: ActiveAi; missing: string | null } => {
    if (!loaded || !ready) return { active: null, missing: null };
    const choice = saved.choice ?? (hosted ? HOSTED : null);
    if (choice === HOSTED) return hosted ? { active: { type: "hosted" }, missing: null } : { active: null, missing: null };
    const preset = choice ? getPreset(choice) : undefined;
    if (!preset) return { active: null, missing: null };
    const s = settings(preset.id);
    if (!s.baseUrl) return { active: null, missing: `Add the address for ${preset.name}.` };
    if (!s.model) return { active: null, missing: `Choose a model for ${preset.name}.` };
    if (preset.needsKey && !(preset.id in keyStatus)) return { active: null, missing: `Enter your ${preset.name} API key.` };
    return {
      active: { type: "own", preset, config: { kind: preset.kind, baseUrl: s.baseUrl, model: s.model } },
      missing: null,
    };
  }, [loaded, ready, hosted, saved, keyStatus, settings]);

  const value = useMemo(
    () => ({ loaded: loaded && ready, choice: saved.choice ?? (hosted ? HOSTED : null), choose, settings, update, hasKey, setKey, clearKey, active, missing }),
    [loaded, ready, hosted, saved.choice, choose, settings, update, hasKey, setKey, clearKey, active, missing],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAi() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAi must be used inside AiProvider");
  return v;
}
