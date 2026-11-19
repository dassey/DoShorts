"use client";

import { useState } from "react";
import type { AnalyzeResult } from "@/lib/schemas";
import { ToolFrame, useTool } from "../ToolFrame";
import { Card, Field, Handoff, List, Meter, Row, Section, inputClass } from "../ui";

const SEVERITY = { high: "bg-hot text-ink", medium: "bg-amber text-ink", low: "bg-raised text-mute" };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function Analyzer() {
  const [url, setUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const { state, run } = useTool<AnalyzeResult>("analyze");

  return (
    <ToolFrame
      slug="analyze"
      state={state}
      cta="Analyze this Short"
      onSubmit={() => run({ url, transcript })}
      render={(r) => (
        <>
          <section className="rise">
            <Card className="flex gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://i.ytimg.com/vi/${r.video.id}/hqdefault.jpg`}
                alt=""
                className="aspect-[9/16] w-20 shrink-0 rounded-lg bg-raised object-cover"
              />
              <div className="min-w-0">
                <p className="leading-snug font-semibold">{r.video.title}</p>
                <p className="mt-1 text-sm text-mute">
                  {[
                    r.video.channel,
                    r.video.seconds != null && `${r.video.seconds}s`,
                    r.video.views != null && `${compact.format(r.video.views)} views`,
                    r.video.likes != null && `${compact.format(r.video.likes)} likes`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-3 text-xs text-mute">
                  Based on the title
                  {r.basis.stats ? ", public stats" : ""}
                  {r.basis.transcript === "captions" && " and the video's captions"}
                  {r.basis.transcript === "pasted" && " and the transcript you pasted"}.
                  {r.basis.transcript === "none" &&
                    " No captions were available, so hook and pacing notes are inferred. Paste a transcript for a line-by-line read."}
                </p>
              </div>
            </Card>
            <p className="mt-5 text-lg leading-snug">{r.summary}</p>
          </section>

          <Section title="Scores">
            <Card className="grid gap-6 sm:grid-cols-3">
              <Meter label="Hook" score={r.hook.score} note={r.hook.notes} />
              <Meter label="Pacing" score={r.pacing.score} note={r.pacing.notes} />
              <Meter label="Title" score={r.title.score} note={r.title.notes} />
            </Card>
          </Section>

          <Section title="Where viewers are likely to leave" count={r.dropoff_risks.length}>
            <ol className="overflow-hidden rounded-2xl border border-line bg-panel">
              {r.dropoff_risks.map((d, i) => (
                <li key={i} className="flex items-start gap-4 border-b border-line p-4 last:border-0">
                  <span className="w-16 shrink-0 font-mono text-xs text-lime">{d.moment}</span>
                  <p className="min-w-0 flex-1 text-[15px] leading-snug">{d.risk}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${SEVERITY[d.severity]}`}>
                    {d.severity}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          <Section title="Fixes" count={r.fixes.length}>
            <List>
              {r.fixes.map((f, i) => (
                <Row key={i} index={i + 1} text={f.fix} note={f.how} />
              ))}
            </List>
          </Section>

          <Section title="Title rewrites" count={r.title_rewrites.length}>
            <List>
              {r.title_rewrites.map((t, i) => (
                <Row key={i} index={i + 1} text={t}>
                  <Handoff tool="titles" param="title" value={t}>
                    Score
                  </Handoff>
                </Row>
              ))}
            </List>
          </Section>
        </>
      )}
    >
      <Field label="YouTube Short link">
        <input
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/shorts/…"
          inputMode="url"
          required
          autoFocus
        />
      </Field>
      {showTranscript ? (
        <Field label="Transcript" hint="optional, used instead of the video's captions">
          <textarea
            className={`${inputClass} min-h-28`}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste what is said in the video"
            maxLength={8000}
          />
        </Field>
      ) : (
        <button type="button" onClick={() => setShowTranscript(true)} className="text-sm text-mute underline underline-offset-4 hover:text-text">
          Paste a transcript for a more precise read
        </button>
      )}
    </ToolFrame>
  );
}
