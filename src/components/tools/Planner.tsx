"use client";

import { useState } from "react";
import type { PlannerResult } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { CopyButton, Field, Handoff, Section, inputClass } from "../ui";

const planToText = (r: PlannerResult) =>
  r.days
    .map((d) => `DAY ${d.day}: ${d.title}\nFormat: ${d.format}\nHook: ${d.hook}\n${d.outline}\nCTA: ${d.cta}`)
    .join("\n\n");

export function Planner() {
  const [niche, setNiche] = useState("");
  const [goal, setGoal] = useState("");
  const { state, run } = useTool<PlannerResult>("planner");

  return (
    <ToolFrame
      slug="planner"
      state={state}
      cta="Plan my week"
      onSubmit={() => run({ niche, goal })}
      render={(r) => (
        <Section title="Your week" action={<CopyButton text={planToText(r)} label="Copy plan" />}>
          <p className="mb-5 text-lg leading-snug">{r.theme}</p>
          <ol className="overflow-hidden rounded-2xl border border-line bg-panel">
            {r.days.map((d) => (
              <li key={d.day} className="grid gap-x-5 gap-y-2 border-b border-line p-4 last:border-0 sm:grid-cols-[5.5rem_1fr]">
                <div>
                  <p className="font-mono text-2xl leading-none font-semibold text-lime">
                    {String(d.day).padStart(2, "0")}
                  </p>
                  <p className="mt-1.5 text-xs font-semibold tracking-wide text-mute uppercase">{d.format}</p>
                </div>
                <div className="min-w-0">
                  <h3 className="text-[17px] leading-snug font-semibold">{d.title}</h3>
                  <p className="mt-2 text-[15px] leading-snug">
                    <span className="text-mute">Hook: </span>“{d.hook}”
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-mute">{d.outline}</p>
                  <p className="mt-1.5 text-sm text-mute">
                    <span className="text-mute/60">CTA: </span>
                    {d.cta}
                  </p>
                  <div className="mt-2 -ml-2 flex">
                    <Handoff tool="script" param="topic" value={d.title}>
                      Write script
                    </Handoff>
                    <Handoff tool="titles" param="title" value={d.title}>
                      Score title
                    </Handoff>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      )}
    >
      <Field label="Niche">
        <input
          className={inputClass}
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Budget travel in Southeast Asia"
          required
          minLength={2}
          maxLength={120}
          autoFocus
        />
      </Field>
      <Field label="Goal for the week" hint="optional">
        <input className={inputClass} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Get my first 1,000 subscribers" maxLength={200} />
      </Field>
    </ToolFrame>
  );
}
