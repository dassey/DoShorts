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

## Choose your AI

Every tool runs on the AI the user picks in **AI settings**:

| Option | Key needed | Notes |
| --- | --- | --- |
| **Ollama**, **LM Studio** | no | Local models on the user's machine |
| **OpenAI**, **Anthropic**, **OpenRouter** | the user's own | |
| **Custom** | optional | Any OpenAI-compatible address: llama.cpp, vLLM, LocalAI, a LAN box, another provider |
| **Built-in AI** | none | Only if the deployer configures one (below). 2 free runs per tool, then Google sign-in |

With any option except the built-in one, the model call goes from the browser straight to the provider. There is no limit and no account.

Local setup: Ollama only answers pages it trusts, so when DoShorts is not served from `localhost`, start Ollama with `OLLAMA_ORIGINS=<the DoShorts address> ollama serve`. In LM Studio, turn on CORS in the server settings.

## How keys are kept safe

- **A user's key never reaches the DoShorts server.** It is sent only to the provider the user chose. No DoShorts route accepts a key.
- **Never in clear text on the wire.** A key is refused for any `http://` address that is not the user's own machine. Redirects are not followed, and no cookies or referrer are sent with provider requests.
- **Never in plain storage.** Not in a URL, cookie, log or `localStorage`. By default it lives in memory and is gone on reload. If the user ticks Remember, it is encrypted with AES-GCM under a non-extractable WebCrypto key and kept in that browser's IndexedDB; unticking erases it.
- **Locked-down page.** No third-party scripts, cannot be framed, sends no referrer.
- **Deployer secrets stay on the server.** They are read from the environment only and are never sent to the browser.

The limit of any in-browser approach: software already running inside the user's browser profile, such as a malicious extension, can read what the page can. For keys that matter, use a provider key with a spend cap.

## Run it

```bash
npm install
npm run dev
```

No configuration is required. Open the app, go to AI settings, pick your AI.

Optional environment (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `DOSHORTS_BASE_URL`, `DOSHORTS_MODEL`, `DOSHORTS_API_KEY` | Built-in AI on any OpenAI-compatible endpoint, local included |
| `ANTHROPIC_API_KEY` | Built-in AI on Claude (`DOSHORTS_MODEL` defaults to `claude-opus-5-5`; `DOSHORTS_EFFORT`, `DOSHORTS_WEB_SEARCH=0`) |
| `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in for the built-in AI. Redirect URI: `<origin>/api/auth/callback/google` |
| `YOUTUBE_API_KEY` | Adds views and length to the analyzer, and this week's most-viewed Shorts to Trending Topics |

## How it works

- **Stack**: Next.js (App Router), Tailwind, Auth.js with Google. No database.
- **Prompts and result shapes** (`src/lib/prompts.ts`, `src/lib/schemas.ts`) are shared by the browser and the server. Each tool is one model call that must return JSON matching a Zod schema; list lengths are enforced in code.
- **Providers** (`src/lib/providers.ts`): one OpenAI-compatible adapter (structured outputs, with a prompt-only fallback for endpoints that lack them) and the Anthropic SDK. `src/lib/claude.ts` is the server-side Claude path, which adds web search.
- **Key vault** (`src/lib/vault.ts`): the encrypted IndexedDB store for remembered keys.
- **Free-run gate** (`src/lib/usage.ts`): applies to the built-in AI only. Counted per tool in an HMAC-signed, HTTP-only cookie and enforced in the API route. Only successful runs count.
- **Short Analyzer**: works from the title, public stats and captions when YouTube serves them, or a pasted transcript. It does not watch the video, and the result says which inputs it used. The server fetches this public YouTube data for every AI option (`/api/context`), since a browser cannot.
- **Trending Topics**: grounded in the YouTube Data API when a key is set, plus web search on the built-in Claude option. With no live source it says so instead of presenting guesses as trends.

## Not in scope

DoShorts does not run inside YouTube Studio, and does not do keyword-volume research, competitor analytics, bulk tag editing, or live title and thumbnail split-testing.
