import { GenerationError } from "./errors";
import type { ToolContext, ToolInput } from "./prompts";
import type { ToolSlug } from "./tools";
import { fetchTranscript, fetchVideoMeta, parseVideoId, searchRecentShorts } from "./youtube";

/** Server-side data gathering for the tools that need live YouTube data. */
export async function gatherContext<K extends ToolSlug>(slug: K, input: ToolInput<K>): Promise<ToolContext> {
  if (slug === "analyze") {
    const { url, transcript: pasted } = input as ToolInput<"analyze">;
    const id = parseVideoId(url);
    if (!id) throw new GenerationError("That does not look like a YouTube link.", 400);
    const [video, captions] = await Promise.all([fetchVideoMeta(id), pasted ? null : fetchTranscript(id)]);
    if (!video) {
      throw new GenerationError("Could not load that video. Check the link and that the video is public.", 404);
    }
    return {
      video,
      transcript: pasted || captions || "",
      transcriptSource: pasted ? "pasted" : captions ? "captions" : "none",
    };
  }
  if (slug === "trends") {
    return { videos: await searchRecentShorts((input as ToolInput<"trends">).niche) };
  }
  return {};
}
