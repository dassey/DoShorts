"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { ScriptResult } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { Card, CopyButton, Field, Handoff, ScriptView, Section, inputClass, scriptToText } from "../ui";

const LENGTHS = [20, 30, 45, 60];

export function ScriptWriter() {
  const params = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [seconds, setSeconds] = useState(45);
  const [tone, setTone] = useState("");
  const { state, run } = useTool<ScriptResult>("script");

  return (
    <ToolFrame
      slug="script"
      state={state}
      cta="Write the script"
      onSubmit={() => run({ topic, seconds, tone })}
      render={(r) => (
        <>
          <Section
            title={`Script · ${Math.round(r.script.total_seconds)}s`}
            action={
              <span className="flex items-center">
                <Handoff tool="titles" param="title" value={r.title}>
                  Score title
                </Handoff>
                <CopyButton text={`${r.title}\n\n${scriptToText(r.script)}`} label="Copy script" />
              </span>
            }
          >
            <p className="mb-4 text-xl font-semibold tracking-tight">{r.title}</p>
            <ScriptView script={r.script} />
          </Section>
          {r.notes.length > 0 && (
            <Section title="Delivery notes">
              <Card>
                <ul className="space-y-2.5">
                  {r.notes.map((n, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-snug">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-lime" />
                      {n}
                    </li>
                  ))}
                </ul>
              </Card>
            </Section>
          )}
        </>
      )}
    >
      <Field label="Topic or title">
        <input
          className={inputClass}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="3 knife skills every home cook gets wrong"
          required
          minLength={2}
          maxLength={300}
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Length</legend>
          <div className="flex gap-2">
            {LENGTHS.map((s) => (
              <label
                key={s}
                className={`flex-1 cursor-pointer rounded-xl border py-2.5 text-center font-mono text-sm has-focus-visible:outline-2 has-focus-visible:outline-lime ${
                  seconds === s ? "border-lime bg-lime/10 text-lime" : "border-line bg-panel text-mute hover:border-mute/60"
                }`}
              >
                <input type="radio" name="seconds" className="sr-only" checked={seconds === s} onChange={() => setSeconds(s)} />
                {s}s
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Tone" hint="optional">
          <input className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Dry, fast, a little cocky" maxLength={80} />
        </Field>
      </div>
    </ToolFrame>
  );
}
