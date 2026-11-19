"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ComfyError,
  WORKFLOWS,
  connect,
  fileUrl,
  installedModels,
  interrupt,
  joinGraph,
  render,
  shotGraph,
  type CaptionStyle,
  type ComfyConnection,
  type ComfyFile,
  type ComfyInfo,
  type ModelFolder,
  type ModelSlot,
  type SoundMode,
} from "@/lib/comfy";
import type { Storyboard } from "@/lib/schemas";
import { Card, Field, inputClass } from "../ui";

const STORAGE = "ds_comfy";
type Saved = { conn: ComfyConnection; workflow: string; picks: Record<string, Record<string, string>> };
const DEFAULTS: Saved = { conn: { host: "127.0.0.1", port: 8188, modelsDir: "" }, workflow: WORKFLOWS[0].id, picks: {} };

type Shot = Storyboard["shots"][number] & {
  seed: number;
  state: "idle" | "running" | "done" | "error";
  file?: ComfyFile;
  error?: string;
};

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

function Step({ n, title, aside, children }: { n: number; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rise">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-mute uppercase">
          <span className="mr-2 font-mono text-lime">{n}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const selectClass = `${inputClass} font-mono text-sm`;
const linkClass = "text-sm text-mute underline underline-offset-4 hover:text-text";

export function Studio({ board }: { board: Storyboard }) {
  const [saved, setSaved] = useState<Saved>(DEFAULTS);
  const [info, setInfo] = useState<ComfyInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connError, setConnError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Partial<Record<ModelFolder, string[]>>>({});

  const [style, setStyle] = useState(board.style);
  const [shots, setShots] = useState<Shot[]>(() => board.shots.map((s) => ({ ...s, seed: newSeed(), state: "idle" })));
  const [sizeIndex, setSizeIndex] = useState(0);
  const [negative, setNegative] = useState<string | null>(null);
  const [caption, setCaption] = useState<CaptionStyle>({ on: true, position: "bottom", size: 4.5 });
  const [soundMode, setSoundMode] = useState<SoundMode>("voiceover");
  const [voice, setVoice] = useState("a warm, clear, energetic adult voice speaking at a brisk pace");

  const [running, setRunning] = useState(false);
  const [final, setFinal] = useState<{ file?: ComfyFile; error?: string }>({});
  const abort = useRef<AbortController | null>(null);
  const [runId] = useState(() => Math.random().toString(36).slice(2, 8));

  const { conn } = saved;
  const workflow = WORKFLOWS.find((w) => w.id === saved.workflow) ?? WORKFLOWS[0];
  const [width, height] = workflow.sizes[Math.min(sizeIndex, workflow.sizes.length - 1)];
  const negativeText = negative ?? workflow.negative;

  const save = useCallback((next: Saved) => {
    setSaved(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      // storage unavailable: settings last for this visit only
    }
  }, []);

  const doConnect = useCallback(async (c: ComfyConnection) => {
    setConnecting(true);
    setConnError(null);
    try {
      const found = await connect(c);
      const folders: ModelFolder[] = ["checkpoints", "diffusion_models", "text_encoders", "vae", "loras"];
      const lists = await Promise.all(folders.map((f) => installedModels(c, f).catch(() => [] as string[])));
      setInstalled(Object.fromEntries(folders.map((f, i) => [f, lists[i]])));
      setInfo(found);
    } catch (err) {
      setInfo(null);
      setConnError(err instanceof ComfyError ? err.message : "Could not connect.");
    } finally {
      setConnecting(false);
    }
  }, []);

  // The connection is a one-time setup: restore it and reconnect on later visits.
  useEffect(() => {
    let stored: Saved | null = null;
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
      if (raw?.conn?.host) stored = { ...DEFAULTS, ...raw, conn: { ...DEFAULTS.conn, ...raw.conn } };
    } catch {
      // unreadable settings: start from the defaults
    }
    if (!stored) return;
    const restored = stored;
    queueMicrotask(() => {
      setSaved(restored);
      void doConnect(restored.conn);
    });
  }, [doConnect]);

  /** The model file each slot will load: the user's pick, else the expected file if it is installed. */
  const models = useMemo(() => {
    const picks = saved.picks[workflow.id] ?? {};
    return Object.fromEntries(
      workflow.slots.map((slot) => {
        const have = installed[slot.folder] ?? [];
        const pick = picks[slot.id];
        const official = [slot.expected, ...(slot.also ?? [])].find((m) => m && have.includes(m));
        const value = pick && have.includes(pick) ? pick : (official ?? "");
        return [slot.id, value];
      }),
    );
  }, [saved.picks, workflow, installed]);

  const missing = workflow.slots.filter((s) => !models[s.id]);
  const ready = Boolean(info) && missing.length === 0;
  /** The length a shot actually renders at with this workflow. */
  const lengthOf = (s: Shot) => Math.min(workflow.seconds[1], Math.max(workflow.seconds[0], s.seconds));
  const total = shots.reduce((sum, s) => sum + lengthOf(s), 0);
  const doneCount = shots.filter((s) => s.state === "done").length;

  const promptFor = (s: Shot) =>
    workflow.prompt({ style, visual: s.visual, motion: s.motion, sound: s.sound, caption: s.caption, soundMode, voice });

  const patchShot = (i: number, patch: Partial<Shot>) =>
    setShots((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  // Editing what a shot renders from makes its old clip stale.
  const editShot = (i: number, patch: Partial<Shot>) => {
    patchShot(i, { ...patch, state: "idle", file: undefined, error: undefined });
    setFinal({});
  };

  const invalidateAll = () => {
    setShots((list) => list.map((s) => ({ ...s, state: "idle", file: undefined, error: undefined })));
    setFinal({});
  };

  async function renderShot(i: number, shot: Shot, signal: AbortSignal): Promise<ComfyFile> {
    patchShot(i, { state: "running", error: undefined });
    try {
      const graph = shotGraph(
        workflow,
        { prompt: promptFor(shot), seconds: lengthOf(shot), width, height, seed: shot.seed, models, negative: negativeText },
        { text: shot.caption, style: caption },
        `DoShorts/${runId}/shot_${String(i + 1).padStart(2, "0")}`,
        soundMode === "silent",
      );
      const file = await render(conn, graph, signal);
      patchShot(i, { state: "done", file });
      return file;
    } catch (err) {
      const stopped = err instanceof DOMException && err.name === "AbortError";
      patchShot(i, { state: stopped ? "idle" : "error", error: stopped ? undefined : err instanceof Error ? err.message : "Failed." });
      throw err;
    }
  }

  async function run(only?: number) {
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setFinal({});
    try {
      const clips: ComfyFile[] = [];
      for (let i = 0; i < shots.length; i++) {
        const shot = only === i ? { ...shots[i], seed: newSeed() } : shots[i];
        if (only === i) patchShot(i, { seed: shot.seed });
        const reuse = only !== i && shot.state === "done" && shot.file;
        if (only !== undefined && only !== i) {
          if (reuse) clips.push(reuse);
          continue;
        }
        clips.push(reuse || (await renderShot(i, shot, controller.signal)));
      }
      // Join once every shot has a clip.
      if (clips.length === shots.length) {
        const file = await render(conn, joinGraph(clips, `DoShorts/${runId}/short`), controller.signal);
        setFinal({ file });
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setFinal({ error: err instanceof Error ? err.message : "Rendering failed." });
      }
    } finally {
      setRunning(false);
    }
  }

  function stop() {
    abort.current?.abort();
    void interrupt(conn);
  }

  const sep = conn.modelsDir.includes("\\") ? "\\" : "/";
  const savePath = (slot: ModelSlot) =>
    `${conn.modelsDir ? conn.modelsDir.replace(/[\\/]+$/, "") : "ComfyUI/models"}${sep}${slot.folder}${sep}`;

  return (
    <>
      <div className="rise">
        <p className="text-2xl font-semibold tracking-tight">{board.title}</p>
        <p className="mt-1 text-sm text-mute">
          {shots.length} shots · {total}s · {width}×{height}
        </p>
      </div>

      <Step
        n={1}
        title="ComfyUI"
        aside={info && <span className="font-mono text-xs text-lime">Connected</span>}
      >
        <Card className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="IP address">
              <input className={`${inputClass} font-mono`} value={conn.host} spellCheck={false}
                onChange={(e) => save({ ...saved, conn: { ...conn, host: e.target.value.trim() } })} placeholder="127.0.0.1" />
            </Field>
            <Field label="Port">
              <input className={`${inputClass} font-mono`} value={conn.port || ""} inputMode="numeric"
                onChange={(e) => save({ ...saved, conn: { ...conn, port: Number(e.target.value.replace(/\D/g, "")) } })} placeholder="8188" />
            </Field>
          </div>
          <Field label="Models folder" hint="so download instructions show your real path">
            <input className={`${inputClass} font-mono`} value={conn.modelsDir} spellCheck={false}
              onChange={(e) => save({ ...saved, conn: { ...conn, modelsDir: e.target.value } })} placeholder="C:\ComfyUI\models" />
          </Field>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button type="button" onClick={() => doConnect(conn)} disabled={connecting || running}
              className="rounded-full border border-line px-5 py-2 text-sm font-medium hover:border-mute disabled:opacity-50">
              {connecting ? "Connecting…" : info ? "Reconnect" : "Connect"}
            </button>
            <p className="text-sm" aria-live="polite">
              {info && (
                <span className="text-mute">
                  ComfyUI {info.version} · {info.device}
                  {info.vramGb ? ` · ${info.vramGb} GB` : ""}
                </span>
              )}
              {connError && <span className="text-hot">{connError}</span>}
              {!info && !connError && !connecting && <span className="text-mute">Saved in this browser. You set this up once.</span>}
            </p>
          </div>
        </Card>
      </Step>

      <Step n={2} title="Workflow and models">
        <div className="grid gap-2 sm:grid-cols-2">
          {WORKFLOWS.map((w) => (
            <label key={w.id}
              className={`cursor-pointer rounded-xl border p-3.5 has-focus-visible:outline-2 has-focus-visible:outline-lime ${
                w.id === workflow.id ? "border-lime bg-lime/10" : "border-line bg-panel hover:border-mute/60"
              }`}>
              <input type="radio" name="workflow" className="sr-only" checked={w.id === workflow.id} disabled={running}
                onChange={() => { save({ ...saved, workflow: w.id }); setSizeIndex(0); setNegative(null); invalidateAll(); }} />
              <span className="block text-sm font-semibold">{w.name}</span>
              <span className="mt-1 block text-xs leading-relaxed text-mute">{w.summary}</span>
              <span className="mt-1.5 block font-mono text-[11px] text-mute">{w.seconds[0]}–{w.seconds[1]}s per shot</span>
            </label>
          ))}
        </div>

        <Card className="mt-3 space-y-4">
          <p className="text-xs text-mute">
            {workflow.basedOn ? `Follows ComfyUI's bundled "${workflow.basedOn}" workflow. ` : ""}
            Built-in nodes only, no custom nodes to install.
          </p>
          {workflow.slots.map((slot) => {
            const have = installed[slot.folder] ?? [];
            const value = models[slot.id];
            return (
              <div key={slot.id}>
                <Field label={slot.label} hint={slot.expected ? `expects ${slot.expected}` : "any installed checkpoint"}>
                  <select className={selectClass} value={value} disabled={!info || running}
                    onChange={(e) => { save({ ...saved, picks: { ...saved.picks, [workflow.id]: { ...saved.picks[workflow.id], [slot.id]: e.target.value } } }); invalidateAll(); }}>
                    {!value && <option value="">{info ? "Not installed: choose one, or download below" : "Connect to ComfyUI first"}</option>}
                    {have.map((m) => (
                      <option key={m} value={m}>
                        {m}
                        {m === slot.expected ? "  (expected)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                {info && !value && (
                  <p className="mt-1.5 text-sm text-amber">
                    {slot.url ? (
                      <>
                        <a href={slot.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">Download {slot.expected}</a>
                        {" "}and save it to{" "}
                      </>
                    ) : (
                      "Put a checkpoint in "
                    )}
                    <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-text">{savePath(slot)}</code>, then Reconnect.
                  </p>
                )}
                {value && slot.expected && value !== slot.expected && !slot.also?.includes(value) && (
                  <p className="mt-1.5 text-xs text-mute">Using a different file than the workflow was designed for. It must be the same kind of model.</p>
                )}
              </div>
            );
          })}
          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <Field label="Frame size">
              <select className={selectClass} value={sizeIndex} disabled={running}
                onChange={(e) => { setSizeIndex(Number(e.target.value)); invalidateAll(); }}>
                {workflow.sizes.map(([w, h], i) => (
                  <option key={i} value={i}>{w} × {h}</option>
                ))}
              </select>
            </Field>
            <Field label="Captions">
              <select className={selectClass} disabled={running}
                value={caption.on ? caption.position : "off"}
                onChange={(e) => { const v = e.target.value; setCaption(v === "off" ? { ...caption, on: false } : { ...caption, on: true, position: v as "top" | "bottom" }); invalidateAll(); }}>
                <option value="bottom">Burned in, bottom</option>
                <option value="top">Burned in, top</option>
                <option value="off">Off</option>
              </select>
            </Field>
          </div>
          {workflow.sound && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sound">
                <select className={selectClass} value={soundMode} disabled={running}
                  onChange={(e) => { setSoundMode(e.target.value as SoundMode); invalidateAll(); }}>
                  <option value="voiceover">Voiceover + background sound</option>
                  <option value="background">Background sound only</option>
                  <option value="silent">Silent</option>
                </select>
              </Field>
              {soundMode === "voiceover" && (
                <Field label="Narrator voice" hint="same description for every shot">
                  <input className={`${inputClass} text-sm`} value={voice} disabled={running}
                    onChange={(e) => { setVoice(e.target.value); invalidateAll(); }} />
                </Field>
              )}
            </div>
          )}
        </Card>
      </Step>

      <Step n={3} title="What each shot is made from" aside={<span className="font-mono text-xs text-mute">{doneCount}/{shots.length} rendered</span>}>
        <Card className="mb-3 space-y-4">
          <Field label="Style" hint="added to every shot's prompt">
            <textarea className={`${inputClass} min-h-16 text-sm`} value={style} disabled={running}
              onChange={(e) => { setStyle(e.target.value); invalidateAll(); }} />
          </Field>
          {(workflow.negative || negative !== null) && (
            <Field label="Negative prompt" hint="what to steer away from">
              <textarea className={`${inputClass} min-h-16 text-sm`} value={negativeText} disabled={running}
                onChange={(e) => { setNegative(e.target.value); invalidateAll(); }} />
            </Field>
          )}
        </Card>

        <ol className="space-y-3">
          {shots.map((s, i) => (
            <li key={i} className="grid gap-4 rounded-2xl border border-line bg-panel p-4 sm:grid-cols-[6.5rem_1fr]">
              <div>
                <div className="grid aspect-[9/16] w-full place-items-center overflow-hidden rounded-lg border border-line bg-raised max-sm:w-28">
                  {s.file ? (
                    <video src={fileUrl(conn, s.file)} className="size-full object-cover" muted loop autoPlay playsInline />
                  ) : (
                    <span className={`px-2 text-center font-mono text-xs ${s.state === "error" ? "text-hot" : s.state === "running" ? "animate-pulse text-lime" : "text-mute"}`}>
                      {s.state === "running" ? "rendering" : s.state === "error" ? "failed" : String(i + 1).padStart(2, "0")}
                    </span>
                  )}
                </div>
                <label className="mt-2 flex items-center gap-1.5 text-xs text-mute">
                  <input className="w-12 rounded-md border border-line bg-ink px-1.5 py-1 text-center font-mono text-text" type="number" min={1} max={10}
                    value={s.seconds} disabled={running}
                    onChange={(e) => editShot(i, { seconds: Math.min(10, Math.max(1, Math.round(Number(e.target.value)) || 1)) })} />
                  seconds
                </label>
                {lengthOf(s) !== s.seconds && <p className="mt-1 text-xs text-amber">renders as {lengthOf(s)}s</p>}
              </div>
              <div className="min-w-0 space-y-3">
                <Field label="Caption" hint={workflow.sound && soundMode === "voiceover" ? "burned in, and spoken as the voiceover" : "burned into the clip"}>
                  <input className={inputClass} value={s.caption} disabled={running} onChange={(e) => editShot(i, { caption: e.target.value })} />
                </Field>
                <Field label="Prompt">
                  <textarea className={`${inputClass} min-h-20 text-sm`} value={s.visual} disabled={running} onChange={(e) => editShot(i, { visual: e.target.value })} />
                </Field>
                {workflow.kind === "video" && (
                  <Field label="Motion">
                    <input className={`${inputClass} text-sm`} value={s.motion} disabled={running} onChange={(e) => editShot(i, { motion: e.target.value })} />
                  </Field>
                )}
                {workflow.sound && soundMode !== "silent" && (
                  <Field label="Background sound">
                    <input className={`${inputClass} text-sm`} value={s.sound} disabled={running} onChange={(e) => editShot(i, { sound: e.target.value })} />
                  </Field>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-mute hover:text-text">Exact text sent to the model</summary>
                  <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-mute">{promptFor(s)}</pre>
                </details>
                {s.error && <p role="alert" className="text-sm text-hot">{s.error}</p>}
                {s.state === "done" && !running && (
                  <button type="button" onClick={() => run(i)} className={linkClass}>
                    Render this shot again
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Step>

      <Step n={4} title="Render">
        <Card>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {running ? (
              <button type="button" onClick={stop} className="rounded-full border border-hot/60 px-6 py-2.5 text-sm font-semibold text-hot hover:bg-hot/10">
                Stop
              </button>
            ) : (
              <button type="button" onClick={() => run()} disabled={!ready}
                className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50">
                {final.file ? "Render again" : doneCount > 0 ? "Render the rest and join" : "Render the Short"}
              </button>
            )}
            <p className="text-sm text-mute" aria-live="polite">
              {running
                ? doneCount < shots.length ? `Rendering shot ${doneCount + 1} of ${shots.length} on your machine…` : "Joining the clips…"
                : !info ? "Connect to ComfyUI in step 1."
                : missing.length ? `${missing.length} model ${missing.length === 1 ? "file is" : "files are"} missing in step 2.`
                : `Renders ${shots.length} clips one at a time, then joins them. Shots already rendered are kept.`}
            </p>
          </div>
          {final.error && <p role="alert" className="mt-4 rounded-xl border border-hot/40 bg-hot/10 px-4 py-3 text-sm">{final.error}</p>}
          {final.file && (
            <div className="mt-5 flex flex-col gap-5 sm:flex-row">
              <video src={fileUrl(conn, final.file)} controls playsInline className="aspect-[9/16] w-56 rounded-xl border border-line bg-raised" />
              <div className="text-sm leading-relaxed">
                <p className="text-base font-semibold">Your Short is ready.</p>
                <p className="mt-1 text-mute">
                  Saved by ComfyUI as{" "}
                  <code className="rounded bg-raised px-1.5 py-0.5 font-mono text-xs text-text">
                    output/{final.file.subfolder}/{final.file.filename}
                  </code>
                </p>
                <a href={fileUrl(conn, final.file)} download={final.file.filename}
                  className="mt-4 inline-block rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:opacity-90">
                  Download mp4
                </a>
                <p className="mt-4 text-mute">
                  {!workflow.sound || soundMode === "silent"
                    ? "It has no sound. Record the captions as your voiceover over it, or add audio in your editor."
                    : soundMode === "voiceover"
                      ? "Each shot's voiceover was generated separately, so the voice can vary between shots. If it does, switch Sound to background only and record the voiceover yourself."
                      : "It has background sound only. Record the captions as your voiceover over it."}
                </p>
              </div>
            </div>
          )}
        </Card>
      </Step>
    </>
  );
}
