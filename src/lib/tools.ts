export const FREE_USES_PER_TOOL = 2;

export const TOOLS = [
  {
    slug: "copilot",
    name: "AI Copilot",
    tagline: "One topic in. Titles, hooks, thumbnails, script, description and spin-off ideas out.",
    short: "Full package from one topic",
  },
  {
    slug: "titles",
    name: "Title Scorer",
    tagline: "Score a title, see exactly why it is weak, and get stronger rewrites.",
    short: "Score and rewrite a title",
  },
  {
    slug: "script",
    name: "Script Writer",
    tagline: "A timed short-form script, from the hook to the call-to-action.",
    short: "Timed script, hook to CTA",
  },
  {
    slug: "analyze",
    name: "Short Analyzer",
    tagline: "Paste a YouTube Short. Get hook, pacing and title notes, drop-off risks and concrete fixes.",
    short: "Diagnose an existing Short",
  },
  {
    slug: "trends",
    name: "Trending Topics",
    tagline: "What is moving in your niche right now, with a video idea for each topic.",
    short: "What is moving in your niche",
  },
  {
    slug: "planner",
    name: "7-Day Planner",
    tagline: "A week of Shorts for your niche, one distinct idea per day.",
    short: "A week of Shorts ideas",
  },
] as const;

export type ToolSlug = (typeof TOOLS)[number]["slug"];

export function getTool(slug: string) {
  return TOOLS.find((t) => t.slug === slug);
}
