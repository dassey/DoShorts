import type { VideoMeta } from "./schemas";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const API = "https://www.googleapis.com/youtube/v3";
const key = () => process.env.YOUTUBE_API_KEY;

export function parseVideoId(input: string): string | null {
  const raw = input.trim();
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null | undefined;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    id = ["shorts", "embed", "live", "v"].includes(first) ? second : url.searchParams.get("v");
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

async function getJson<T>(url: string, ms = 8000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(ms),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

function isoDurationToSeconds(iso: string): number | undefined {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return undefined;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

type ApiVideo = {
  id: string;
  snippet: { title: string; channelTitle: string; description: string; publishedAt: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration: string };
};

const num = (s?: string) => (s == null ? undefined : Number(s));

function fromApi(v: ApiVideo): VideoMeta {
  return {
    id: v.id,
    title: v.snippet.title,
    channel: v.snippet.channelTitle,
    description: v.snippet.description,
    publishedAt: v.snippet.publishedAt,
    seconds: v.contentDetails ? isoDurationToSeconds(v.contentDetails.duration) : undefined,
    views: num(v.statistics?.viewCount),
    likes: num(v.statistics?.likeCount),
    comments: num(v.statistics?.commentCount),
  };
}

async function videosById(ids: string[]): Promise<VideoMeta[]> {
  if (!key() || ids.length === 0) return [];
  const data = await getJson<{ items: ApiVideo[] }>(
    `${API}/videos?part=snippet,statistics,contentDetails&id=${ids.join(",")}&key=${key()}`,
  );
  return (data?.items ?? []).map(fromApi);
}

/** Title and channel always (oEmbed, no key). Stats and duration when YOUTUBE_API_KEY is set. */
export async function fetchVideoMeta(id: string): Promise<VideoMeta | null> {
  const [full] = await videosById([id]);
  if (full) return full;
  const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
  const o = await getJson<{ title: string; author_name: string }>(
    `https://www.youtube.com/oembed?url=${watch}&format=json`,
  );
  return o ? { id, title: o.title, channel: o.author_name } : null;
}

/**
 * Best-effort captions with timestamps. YouTube has no public transcript API,
 * so this reads the caption track advertised on the watch page and returns
 * null whenever YouTube does not serve it.
 */
export async function fetchTranscript(id: string): Promise<string | null> {
  try {
    const page = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(8000),
    });
    if (!page.ok) return null;
    const m = /"captionTracks":(\[.*?\])/.exec(await page.text());
    if (!m) return null;
    const tracks = JSON.parse(m[1]) as { baseUrl: string; languageCode: string; kind?: string }[];
    const track =
      tracks.find((t) => t.languageCode.startsWith("en") && t.kind !== "asr") ??
      tracks.find((t) => t.languageCode.startsWith("en")) ??
      tracks[0];
    // Only ever follow a caption URL that points back at YouTube.
    if (!track || !/(^|\.)youtube\.com$/.test(new URL(track.baseUrl).hostname)) return null;
    const data = await getJson<{ events?: { tStartMs?: number; segs?: { utf8: string }[] }[] }>(
      `${track.baseUrl}&fmt=json3`,
    );
    const lines = (data?.events ?? [])
      .map((e) => ({
        t: Math.round((e.tStartMs ?? 0) / 1000),
        text: (e.segs ?? []).map((s) => s.utf8).join("").replace(/\s+/g, " ").trim(),
      }))
      .filter((l) => l.text)
      .map((l) => `[${l.t}s] ${l.text}`);
    return lines.length ? lines.join("\n").slice(0, 8000) : null;
  } catch {
    return null;
  }
}

/** Most-viewed short videos for a niche from the last 7 days. Empty without YOUTUBE_API_KEY. */
export async function searchRecentShorts(niche: string): Promise<VideoMeta[]> {
  if (!key()) return [];
  const after = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const q = encodeURIComponent(`${niche} #shorts`);
  const data = await getJson<{ items: { id: { videoId: string } }[] }>(
    `${API}/search?part=id&type=video&videoDuration=short&order=viewCount&maxResults=25` +
      `&publishedAfter=${after}&q=${q}&key=${key()}`,
  );
  const ids = (data?.items ?? []).map((i) => i.id.videoId).filter(Boolean);
  return videosById(ids);
}
