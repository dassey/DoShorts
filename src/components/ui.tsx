"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Script } from "@/lib/schemas";

export const inputClass =
  "w-full rounded-xl border border-line bg-panel px-3.5 py-2.5 text-[15px] text-text placeholder:text-mute/60 hover:border-mute/60 focus:border-lime focus:outline-none";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-mute">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rise">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-mute uppercase">
          {title}
          {count != null && <span className="ml-2 font-mono text-lime">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>{children}</div>;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard unavailable: nothing to do
        }
      }}
      className="shrink-0 rounded-md px-2 py-1 text-xs text-mute hover:bg-raised hover:text-text"
    >
      {done ? "Copied" : label}
    </button>
  );
}

/** Hands a result off to another tool with its input prefilled. */
export function Handoff({
  tool,
  param,
  value,
  children,
}: {
  tool: string;
  param: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/${tool}?${param}=${encodeURIComponent(value)}`}
      className="shrink-0 rounded-md px-2 py-1 text-xs text-lime hover:bg-lime/10"
    >
      {children} →
    </Link>
  );
}

/** Sends a finished script to Generate. It is too long for a link, so it travels in session storage. */
export function ToGenerate({ title, script }: { title?: string; script: Script }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          sessionStorage.setItem("ds_generate_source", `${title ? `${title}\n\n` : ""}${scriptToText(script)}`);
        } catch {
          // storage unavailable: Generate opens empty
        }
        router.push("/generate");
      }}
      className="shrink-0 rounded-md px-2 py-1 text-xs text-lime hover:bg-lime/10"
    >
      Generate video →
    </button>
  );
}

/** A copyable line of text with optional secondary note and actions. */
export function Row({
  index,
  text,
  note,
  children,
}: {
  index?: number;
  text: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-line px-4 py-3 last:border-0">
      {index != null && (
        <span className="mt-0.5 w-5 shrink-0 font-mono text-xs text-mute">{String(index).padStart(2, "0")}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug font-medium">{text}</p>
        {note && <p className="mt-1 text-sm text-mute">{note}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {children}
        <CopyButton text={text} />
      </div>
    </li>
  );
}

export function List({ children }: { children: React.ReactNode }) {
  return <ol className="overflow-hidden rounded-2xl border border-line bg-panel">{children}</ol>;
}

export const scoreColor = (pct: number) => (pct >= 75 ? "text-lime" : pct >= 50 ? "text-amber" : "text-hot");
const scoreBg = (pct: number) => (pct >= 75 ? "bg-lime" : pct >= 50 ? "bg-amber" : "bg-hot");

/** A labelled 0-10 score with a bar. */
export function Meter({ label, score, note }: { label: string; score: number; note?: string }) {
  const s = Math.max(0, Math.min(10, score));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium capitalize">{label}</span>
        <span className={`font-mono ${scoreColor(s * 10)}`}>{s}/10</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${scoreBg(s * 10)}`} style={{ width: `${s * 10}%` }} />
      </div>
      {note && <p className="mt-2 text-sm leading-relaxed text-mute">{note}</p>}
    </div>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function scriptToText(script: Script) {
  return script.sections
    .map((s) => `[${fmt(s.start)}-${fmt(s.end)}] ${s.label.toUpperCase()}\n${s.voiceover}\n(On screen: ${s.on_screen})`)
    .join("\n\n");
}

export function ScriptView({ script }: { script: Script }) {
  return (
    <ol className="overflow-hidden rounded-2xl border border-line bg-panel">
      {script.sections.map((s, i) => (
        <li key={i} className="grid gap-x-5 gap-y-1 border-b border-line p-4 last:border-0 sm:grid-cols-[7.5rem_1fr]">
          <div>
            <p className="font-mono text-xs text-lime">
              {fmt(s.start)}–{fmt(s.end)}
            </p>
            <p className="mt-0.5 text-xs font-semibold tracking-wide text-mute uppercase">{s.label}</p>
          </div>
          <div>
            <p className="text-[15px] leading-relaxed">{s.voiceover}</p>
            <p className="mt-1.5 text-sm text-mute">
              <span className="text-mute/60">On screen: </span>
              {s.on_screen}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
