"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { TitlesResult } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { Card, Field, Handoff, List, Meter, Row, Section, inputClass, scoreColor } from "../ui";

export function Titles() {
  const params = useSearchParams();
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [context, setContext] = useState("");
  const { state, run } = useTool<TitlesResult>("titles");

  return (
    <ToolFrame
      slug="titles"
      state={state}
      cta="Score this title"
      onSubmit={() => run({ title, context })}
      render={(r) => (
        <>
          <section className="rise flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="shrink-0">
              <p className={`font-mono text-7xl leading-none font-semibold ${scoreColor(r.score)}`}>
                {Math.round(r.score)}
              </p>
              <p className="mt-1 text-xs tracking-wide text-mute uppercase">out of 100</p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-lg leading-snug font-medium">{r.verdict}</p>
              <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                {r.breakdown.map((b, i) => (
                  <Meter key={i} label={b.criterion} score={b.score} note={b.note} />
                ))}
              </div>
            </div>
          </section>

          <Section title="Weaknesses" count={r.weaknesses.length}>
            <Card>
              <ul className="space-y-2.5">
                {r.weaknesses.map((w, i) => (
                  <li key={i} className="flex gap-3 text-[15px] leading-snug">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-hot" />
                    {w}
                  </li>
                ))}
              </ul>
            </Card>
          </Section>

          <Section title="Stronger rewrites" count={r.rewrites.length}>
            <List>
              {r.rewrites.map((w, i) => (
                <Row key={i} index={i + 1} text={w.title} note={w.why}>
                  <span className={`mr-2 font-mono text-sm ${scoreColor(w.predicted_score)}`}>
                    {Math.round(w.predicted_score)}
                  </span>
                  <Handoff tool="script" param="topic" value={w.title}>
                    Script
                  </Handoff>
                </Row>
              ))}
            </List>
          </Section>
        </>
      )}
    >
      <Field label="Your title">
        <input
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="My morning routine"
          required
          minLength={2}
          maxLength={200}
          autoFocus
        />
      </Field>
      <Field label="What the video is about" hint="optional, makes rewrites more accurate">
        <input
          className={inputClass}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="I wake up at 5am and show the three habits that fixed my energy"
          maxLength={400}
        />
      </Field>
    </ToolFrame>
  );
}
