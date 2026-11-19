"use client";

import { useState } from "react";
import type { TrendsResult } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { Card, CopyButton, Field, Handoff, Section, inputClass } from "../ui";

const MOMENTUM = { rising: "text-lime", peaking: "text-amber", steady: "text-mute" };
const NICHES = ["Fitness", "Personal finance", "Cooking", "Gaming", "Tech", "Beauty", "Travel", "Productivity"];

function basisLine(b: TrendsResult["basis"]) {
  const parts = [
    b.youtube > 0 && `${b.youtube} of this week's most-viewed Shorts`,
    b.web > 0 && `${b.web} web results`,
  ].filter(Boolean);
  return parts.length
    ? `Based on ${parts.join(" and ")}.`
    : "No live data was available for this run, so these are durable topics from the model's general knowledge rather than this week's trends.";
}

export function Trends() {
  const [niche, setNiche] = useState("");
  const { state, run } = useTool<TrendsResult>("trends");

  return (
    <ToolFrame
      slug="trends"
      state={state}
      cta="Find topics"
      wait="Checking what is current in this niche. This can take up to a minute."
      onSubmit={() => run({ niche })}
      render={(r) => (
        <>
          <Section title="Topics" count={r.topics.length}>
            <p className="-mt-1 mb-4 text-sm text-mute">{basisLine(r.basis)}</p>
            <div className="grid gap-3">
              {r.topics.map((t, i) => (
                <Card key={i}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-lg leading-snug font-semibold">{t.topic}</h3>
                    <span className={`shrink-0 font-mono text-xs uppercase ${MOMENTUM[t.momentum]}`}>{t.momentum}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-mute">{t.why}</p>
                  <div className="mt-4 rounded-xl bg-raised p-3.5">
                    <p className="text-[15px] font-medium">{t.sample_title}</p>
                    <p className="mt-1 text-sm text-mute">{t.video_idea}</p>
                    <div className="mt-2 -ml-2 flex items-center">
                      <Handoff tool="copilot" param="topic" value={t.video_idea}>
                        Build in Copilot
                      </Handoff>
                      <CopyButton text={t.sample_title} label="Copy title" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </Section>
          {r.sources.length > 0 && (
            <Section title="Sources">
              <ul className="space-y-1.5 text-sm">
                {r.sources.map((s) => (
                  <li key={s.url} className="truncate">
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-mute underline underline-offset-4 hover:text-text">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    >
      <Field label="Niche">
        <input
          className={inputClass}
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Home espresso"
          required
          minLength={2}
          maxLength={120}
          autoFocus
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {NICHES.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNiche(n)}
            className="rounded-full border border-line px-3 py-1 text-sm text-mute hover:border-mute hover:text-text"
          >
            {n}
          </button>
        ))}
      </div>
    </ToolFrame>
  );
}
