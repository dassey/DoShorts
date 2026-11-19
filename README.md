# DoShorts

A standalone AI toolkit for planning and improving short-form videos.

| Tool | What it does |
| --- | --- |
| **AI Copilot** | One topic in: 5 titles, 10 hooks, 4 thumbnail concepts, a timed script, a description and 5 follow-up ideas |
| **Title Scorer** | Scores a title out of 100, explains its weaknesses, gives 5 stronger rewrites |
| **Script Writer** | A 20-60 second script in timed sections, hook to call-to-action |
| **Short Analyzer** | Reads a YouTube Short's title, stats and captions; reports on hook, pacing, title, drop-off risks and fixes |
| **Trending Topics** | Topics getting attention in a niche, with a video idea for each |
| **7-Day Planner** | A week of Shorts for a niche |

Results hand off between tools (a trending topic opens in Copilot, a Copilot title opens in the Title Scorer, a planner day opens in the Script Writer).

Free to use. Each tool runs twice without an account; after that it asks for Google sign-in.

## Run it

```bash
cp .env.example .env.local   # then fill it in
npm install
npm run dev
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `AUTH_SECRET` | yes | Signs sessions and the free-run cookie (`npx auth secret`) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | yes | Google OAuth client. Redirect URI: `<origin>/api/auth/callback/google` |
| `YOUTUBE_API_KEY` | no | YouTube Data API v3. Adds views and length to the analyzer, and this week's most-viewed Shorts to Trending Topics |
| `DOSHORTS_MODEL` | no | Defaults to `claude-opus-5-5` |
| `DOSHORTS_EFFORT` | no | `low` (default), `medium` or `high` |
| `DOSHORTS_WEB_SEARCH` | no | Set to `0` to turn off web search in Trending Topics |

## How it works

- **Stack**: Next.js (App Router), Tailwind, Auth.js with Google, the Anthropic SDK. No database.
- **Generation** (`src/lib/claude.ts`, `src/lib/run.ts`): each tool is one Claude call with a Zod schema as the structured output format, so the UI always receives the shape it renders. List lengths are enforced in code.
- **Free-run gate** (`src/lib/usage.ts`): anonymous usage is counted per tool in an HMAC-signed, HTTP-only cookie and enforced in the API route. Only successful runs count. Clearing cookies resets the count.
- **Short Analyzer** (`src/lib/youtube.ts`): works from the title, public stats (with `YOUTUBE_API_KEY`) and captions when YouTube serves them, or a transcript the user pastes. It does not watch the video, and the result says which inputs it used.
- **Trending Topics**: uses the YouTube Data API (when a key is set) and Claude's web search tool, and shows what the result was based on. With neither available it says so instead of presenting guesses as trends.

## Not in scope

DoShorts does not run inside YouTube Studio, and does not do keyword-volume research, competitor analytics, bulk tag editing, or live title and thumbnail split-testing.
