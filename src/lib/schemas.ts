import { z } from "zod";

// ---------- Inputs ----------

const text = (max: number) => z.string().trim().min(2).max(max);
const optional = (max: number) => z.string().trim().max(max).optional().default("");

export const inputs = {
  copilot: z.object({ topic: text(300), niche: optional(120), audience: optional(200) }),
  titles: z.object({ title: text(200), context: optional(400) }),
  script: z.object({
    topic: text(300),
    seconds: z.coerce.number().int().min(15).max(180).default(45),
    tone: optional(80),
  }),
  analyze: z.object({ url: text(300), transcript: optional(8000) }),
  trends: z.object({ niche: text(120) }),
  planner: z.object({ niche: text(120), goal: optional(200) }),
  generate: z.object({ source: text(6000), seconds: z.coerce.number().int().min(10).max(90).default(30) }),
};

// ---------- Outputs ----------
// Counts are requested in the prompt and enforced in code: structured outputs
// do not support array length constraints.

export const ScriptSchema = z.object({
  total_seconds: z.number().describe("Total runtime in seconds"),
  sections: z.array(
    z.object({
      label: z.string().describe("Section name, e.g. Hook, Setup, Payoff, CTA"),
      start: z.number().describe("Start time in seconds"),
      end: z.number().describe("End time in seconds"),
      voiceover: z.string().describe("Exactly what is said"),
      on_screen: z.string().describe("What the viewer sees: shot, b-roll, text overlay"),
    }),
  ),
});

export const outputs = {
  copilot: z.object({
    titles: z.array(z.object({ title: z.string(), angle: z.string() })),
    hooks: z.array(z.object({ hook: z.string(), style: z.string() })),
    thumbnails: z.array(
      z.object({ concept: z.string(), visual: z.string(), text_overlay: z.string() }),
    ),
    script: ScriptSchema,
    description: z.string(),
    hashtags: z.array(z.string()),
    more_ideas: z.array(z.object({ idea: z.string(), why: z.string() })),
  }),
  titles: z.object({
    score: z.number().describe("Overall score, integer 0-100"),
    verdict: z.string().describe("One sentence"),
    breakdown: z.array(
      z.object({
        criterion: z.string(),
        score: z.number().describe("Integer 0-10"),
        note: z.string(),
      }),
    ),
    weaknesses: z.array(z.string()),
    rewrites: z.array(
      z.object({
        title: z.string(),
        why: z.string(),
        predicted_score: z.number().describe("Integer 0-100"),
      }),
    ),
  }),
  script: z.object({
    title: z.string(),
    script: ScriptSchema,
    notes: z.array(z.string()).describe("Delivery and editing notes"),
  }),
  analyze: z.object({
    summary: z.string(),
    hook: z.object({ score: z.number().describe("Integer 0-10"), notes: z.string() }),
    pacing: z.object({ score: z.number().describe("Integer 0-10"), notes: z.string() }),
    title: z.object({ score: z.number().describe("Integer 0-10"), notes: z.string() }),
    dropoff_risks: z.array(
      z.object({
        moment: z.string().describe("Where in the video, e.g. 0-3s"),
        risk: z.string(),
        severity: z.enum(["low", "medium", "high"]),
      }),
    ),
    fixes: z.array(z.object({ fix: z.string(), how: z.string() })),
    title_rewrites: z.array(z.string()),
  }),
  trends: z.object({
    topics: z.array(
      z.object({
        topic: z.string(),
        why: z.string().describe("Why it is getting attention now"),
        momentum: z.enum(["rising", "peaking", "steady"]),
        video_idea: z.string(),
        sample_title: z.string(),
      }),
    ),
  }),
  planner: z.object({
    theme: z.string().describe("The through-line for the week"),
    days: z.array(
      z.object({
        day: z.number().describe("1-7"),
        title: z.string(),
        hook: z.string(),
        format: z.string().describe("e.g. tutorial, myth-bust, before/after, story"),
        outline: z.string().describe("Two or three sentences on what happens"),
        cta: z.string(),
      }),
    ),
  }),
  generate: z.object({
    title: z.string(),
    style: z.string().describe("One line applied to every shot so they look like one video: medium, palette, lens, mood"),
    shots: z.array(
      z.object({
        seconds: z.number().describe("Whole seconds, 3 to 8"),
        caption: z.string().describe("The exact words spoken during this shot"),
        visual: z.string().describe("Self-contained prompt for an image or video model"),
        motion: z.string().describe("One sentence of camera or subject movement"),
        sound: z.string().describe("One sentence of the ambient sound and sound effects heard, no speech or music"),
      }),
    ),
  }),
};

export type Script = z.infer<typeof ScriptSchema>;
export type Storyboard = z.infer<typeof outputs.generate>;
export type CopilotResult = z.infer<typeof outputs.copilot>;
export type TitlesResult = z.infer<typeof outputs.titles>;
export type ScriptResult = z.infer<typeof outputs.script>;
export type PlannerResult = z.infer<typeof outputs.planner>;

export type VideoMeta = {
  id: string;
  title: string;
  channel: string;
  description?: string;
  seconds?: number;
  views?: number;
  likes?: number;
  comments?: number;
  publishedAt?: string;
};

export type AnalyzeResult = z.infer<typeof outputs.analyze> & {
  video: VideoMeta;
  basis: { transcript: "captions" | "pasted" | "none"; stats: boolean };
};

export type TrendsResult = z.infer<typeof outputs.trends> & {
  basis: { youtube: number; web: number };
  sources: { title: string; url: string }[];
};
