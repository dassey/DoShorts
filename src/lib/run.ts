import type { z } from "zod";
import { generate, GenerationError } from "./claude";
import { inputs, outputs, type AnalyzeResult, type TrendsResult } from "./schemas";
import type { ToolSlug } from "./tools";
import { fetchTranscript, fetchVideoMeta, parseVideoId, searchRecentShorts } from "./youtube";

type In<K extends ToolSlug> = z.infer<(typeof inputs)[K]>;

const tag = (name: string, value: string) => (value ? `<${name}>\n${value}\n</${name}>\n` : "");

const SCRIPT_RULES = `Script rules: timed sections that run back to back from 0 to the total runtime. Open with the hook (first 2 seconds), keep any setup short, deliver the payoff, close with a call-to-action. Voiceover is paced at roughly 2.5 words per second, so each section's word count has to fit its time window.`;

const runners: { [K in ToolSlug]: (input: In<K>) => Promise<unknown> } = {
  async copilot({ topic, niche, audience }) {
    const { data } = await generate({
      schema: outputs.copilot,
      prompt:
        tag("topic", topic) +
        tag("niche", niche) +
        tag("audience", audience) +
        `Build a complete YouTube Shorts package for this topic:
- exactly 5 titles, each a different angle, under 60 characters
- exactly 10 hooks (the spoken first line), each a different style, such as result-first, bold claim, question, mistake, story
- exactly 4 thumbnail concepts: the idea, the visual, and a text overlay of 4 words or fewer
- one script of about 45 seconds
- a description of 2-3 sentences, plus 3-5 hashtags
- exactly 5 additional video ideas that could follow this one, each with why it would work

${SCRIPT_RULES}`,
    });
    return {
      ...data,
      titles: data.titles.slice(0, 5),
      hooks: data.hooks.slice(0, 10),
      thumbnails: data.thumbnails.slice(0, 4),
      hashtags: data.hashtags.slice(0, 5),
      more_ideas: data.more_ideas.slice(0, 5),
    };
  },

  async titles({ title, context }) {
    const { data } = await generate({
      schema: outputs.titles,
      prompt:
        tag("title", title) +
        tag("video_context", context) +
        `Score this YouTube Shorts title from 0 to 100. Be a tough grader: a typical unedited title lands between 35 and 60.
Break the score down on five criteria, each 0-10: clarity, specificity, curiosity, emotional pull, and length/scannability.
List its concrete weaknesses, for example "too broad: it does not say which mistake".
Then write exactly 5 stronger rewrites that keep the same video promise, each with why it is stronger and a predicted score.`,
    });
    return { ...data, rewrites: data.rewrites.slice(0, 5) };
  },

  async script({ topic, seconds, tone }) {
    const { data } = await generate({
      schema: outputs.script,
      prompt:
        tag("topic", topic) +
        tag("tone", tone) +
        `Write a ${seconds}-second YouTube Shorts script for this topic, with a working title and 2-4 delivery or editing notes.

${SCRIPT_RULES}`,
    });
    return data;
  },

  async analyze({ url, transcript: pasted }) {
    const id = parseVideoId(url);
    if (!id) throw new GenerationError("That does not look like a YouTube link.", 400);
    const [video, captions] = await Promise.all([fetchVideoMeta(id), pasted ? null : fetchTranscript(id)]);
    if (!video) {
      throw new GenerationError("Could not load that video. Check the link and that the video is public.", 404);
    }
    const transcript = pasted || captions || "";
    const facts = [
      `Title: ${video.title}`,
      `Channel: ${video.channel}`,
      video.seconds != null && `Length: ${video.seconds}s`,
      video.views != null && `Views: ${video.views}`,
      video.likes != null && `Likes: ${video.likes}`,
      video.comments != null && `Comments: ${video.comments}`,
      video.publishedAt && `Published: ${video.publishedAt}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { data } = await generate({
      schema: outputs.analyze,
      prompt:
        tag("video", facts) +
        tag("description", video.description?.slice(0, 1500) ?? "") +
        tag("transcript", transcript) +
        `Analyze this YouTube Short for a creator who wants to know why it is underperforming and what to change.
Cover the hook (first 3 seconds), pacing, and title, each scored 0-10 with notes. List the moments where viewers are most likely to swipe away, and give 3-6 concrete fixes, such as shortening the setup or starting with the result, each with how to do it. Add 3 title rewrites.

You are working only from the material above; you cannot see the video itself. ${
          transcript
            ? "Tie hook and pacing notes to specific transcript lines and timestamps."
            : "No transcript was available, so say plainly in the summary that hook and pacing notes are inferred from the title, description and stats, and keep those notes proportionate to that."
        } Do not invent visuals, numbers or retention data.`,
    });
    const result: AnalyzeResult = {
      ...data,
      dropoff_risks: data.dropoff_risks.slice(0, 6),
      fixes: data.fixes.slice(0, 6),
      title_rewrites: data.title_rewrites.slice(0, 3),
      video,
      basis: {
        transcript: pasted ? "pasted" : captions ? "captions" : "none",
        stats: video.views != null,
      },
    };
    return result;
  },

  async trends({ niche }) {
    const videos = await searchRecentShorts(niche);
    const webSearch = process.env.DOSHORTS_WEB_SEARCH !== "0";
    const list = videos
      .map((v) => `- "${v.title}" (${v.channel}), ${v.views ?? "?"} views, published ${v.publishedAt?.slice(0, 10)}`)
      .join("\n");

    const { data, sources } = await generate({
      schema: outputs.trends,
      webSearch,
      prompt:
        tag("niche", niche) +
        tag("top_shorts_last_7_days", list) +
        `Today is ${new Date().toISOString().slice(0, 10)}. Find 8 topics that are getting attention right now in this niche on short-form video.
${list ? "The list above is real data: the most-viewed Shorts for this niche from the past week. Group it into topics. " : ""}${
          webSearch ? "Use web search to check what is current in this niche this week. " : ""
        }
For each topic give why it is getting attention now, its momentum, one specific Shorts idea, and a sample title.
Only report a topic as trending if the data or search results support it. If you have little current evidence, prefer durable, steady topics and mark them "steady" rather than presenting guesses as trends.`,
    });
    const seen = new Set<string>();
    const result: TrendsResult = {
      topics: data.topics.slice(0, 8),
      basis: { youtube: videos.length, web: sources.length },
      sources: sources.filter((s) => !seen.has(s.url) && seen.add(s.url)).slice(0, 8),
    };
    return result;
  },

  async planner({ niche, goal }) {
    const { data } = await generate({
      schema: outputs.planner,
      prompt:
        tag("niche", niche) +
        tag("goal", goal) +
        `Plan 7 days of YouTube Shorts for this niche: exactly 7 entries, day 1 to day 7, one Short per day.
Vary the formats across the week so no two days feel the same, and order them so the week builds, with easy wins early and the strongest idea midweek. Each day needs a title, the spoken hook, the format, a 2-3 sentence outline, and a call-to-action.`,
    });
    return { ...data, days: data.days.slice(0, 7).map((d, i) => ({ ...d, day: i + 1 })) };
  },
};

export function runTool<K extends ToolSlug>(slug: K, input: In<K>): Promise<unknown> {
  return runners[slug](input);
}
