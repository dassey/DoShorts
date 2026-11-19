"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import type { CopilotResult } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { Card, CopyButton, Field, Handoff, List, Row, ScriptView, Section, inputClass, scriptToText } from "../ui";

export function Copilot() {
  const params = useSearchParams();
  const [topic, setTopic] = useState(params.get("topic") ?? "");
  const [niche, setNiche] = useState("");
  const [audience, setAudience] = useState("");
  const { state, run } = useTool<CopilotResult>("copilot");

  return (
    <ToolFrame
      slug="copilot"
      state={state}
      cta="Build the package"
      wait="Writing titles, hooks, thumbnails and a script. This usually takes 30 to 60 seconds."
      onSubmit={() => run({ topic, niche, audience })}
      render={(r) => (
        <>
          <Section title="Titles" count={r.titles.length}>
            <List>
              {r.titles.map((t, i) => (
                <Row key={i} index={i + 1} text={t.title} note={t.angle}>
                  <Handoff tool="titles" param="title" value={t.title}>
                    Score
                  </Handoff>
                </Row>
              ))}
            </List>
          </Section>

          <Section title="Hooks" count={r.hooks.length}>
            <List>
              {r.hooks.map((h, i) => (
                <Row key={i} index={i + 1} text={h.hook} note={h.style} />
              ))}
            </List>
          </Section>

          <Section title="Thumbnail concepts" count={r.thumbnails.length}>
            <div className="grid gap-3 sm:grid-cols-2">
              {r.thumbnails.map((t, i) => (
                <Card key={i} className="flex gap-4">
                  <div className="grid aspect-[9/16] w-20 shrink-0 place-items-center rounded-lg border border-line bg-raised p-1.5 text-center text-[11px] leading-tight font-bold text-lime uppercase">
                    {t.text_overlay}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[15px] leading-snug font-medium">{t.concept}</p>
                    <p className="mt-1.5 text-sm text-mute">{t.visual}</p>
                  </div>
                </Card>
              ))}
            </div>
          </Section>

          <Section
            title={`Script · ${Math.round(r.script.total_seconds)}s`}
            action={<CopyButton text={scriptToText(r.script)} label="Copy script" />}
          >
            <ScriptView script={r.script} />
          </Section>

          <Section
            title="Description"
            action={<CopyButton text={`${r.description}\n\n${r.hashtags.join(" ")}`} label="Copy description" />}
          >
            <Card>
              <p className="leading-relaxed">{r.description}</p>
              <p className="mt-3 font-mono text-sm text-lime">{r.hashtags.join(" ")}</p>
            </Card>
          </Section>

          <Section title="What to make next" count={r.more_ideas.length}>
            <List>
              {r.more_ideas.map((m, i) => (
                <Row key={i} index={i + 1} text={m.idea} note={m.why}>
                  <Handoff tool="copilot" param="topic" value={m.idea}>
                    Build
                  </Handoff>
                </Row>
              ))}
            </List>
          </Section>
        </>
      )}
    >
      <Field label="Video topic">
        <input
          className={inputClass}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Why your sourdough starter keeps dying"
          required
          minLength={2}
          maxLength={300}
          autoFocus
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Niche" hint="optional">
          <input className={inputClass} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Home baking" maxLength={120} />
        </Field>
        <Field label="Audience" hint="optional">
          <input className={inputClass} value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Beginners who gave up once" maxLength={200} />
        </Field>
      </div>
    </ToolFrame>
  );
}
