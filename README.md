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
| **Generate** | Turns a script into a captioned vertical video, rendered locally by ComfyUI |

Results hand off between tools (a trending topic opens in Copilot, a Copilot title opens in the Title Scorer, a planner day opens in the Script Writer).

## Generate (ComfyUI)

Generate renders the Short on your own machine with [ComfyUI](https://github.com/comfyanonymous/ComfyUI). It needs DoShorts to be running on the same machine or network as ComfyUI.

1. **One-time setup.** Enter ComfyUI's IP address, port and models folder. They are saved in the browser.
2. **Shot list.** Your AI splits the script into shots of 2 to 5 seconds, each with a caption and a prompt. Every field is editable.
3. **Workflow and models.** Pick a workflow. Each model slot shows the file the workflow expects and a dropdown of what you have installed. For a missing file it shows the official download link and the exact folder to save it in.
4. **Render.** Each shot becomes a clip with its caption burned in, then the clips are joined into one mp4 in ComfyUI's `output/DoShorts/` folder. A failed shot can be fixed and re-rendered without redoing the rest.

| Workflow | Follows ComfyUI's bundled blueprint | Models |
| --- | --- | --- |
| Video + sound, MiniMax H3 Turbo (default) | Image to Video (MiniMax H3), Turbo LoRA path, text only | H3 diffusion model, Turbo LoRA, `qwen3vl_32b` text encoder, video and audio VAEs |
| Stills, Z-Image Turbo | Text to Image (Z-Image-Turbo) | `z_image_turbo_bf16`, `qwen_3_4b`, `ae` |
| Video clips, Wan 2.2 | Text to Video (Wan 2.2), 4-step LoRA path | Wan 2.2 high and low noise models, two LoRAs, `umt5_xxl`, `wan_2.1_vae` |
| Stills, your own checkpoint | none (the classic checkpoint graph) | Any SD or SDXL checkpoint |

**No custom nodes.** Every node used ships with ComfyUI, including caption burn-in (`TextOverlay`) and assembly (`CreateVideo`, `ConcatenateVideo`, `SaveVideo`). These are recent additions, so use an up-to-date ComfyUI. Workflows live in `src/lib/comfy.ts`.

Sound: MiniMax H3 generates a soundtrack with each clip; the other workflows are silent. None of them produces a voiceover, since ComfyUI has no built-in text-to-speech node. Record the captions yourself, or add audio in an editor.

The page reaches ComfyUI through a small relay in the DoShorts server (`/api/comfy`), because ComfyUI refuses browser requests from other sites. So ComfyUI needs no special launch flags. The relay only runs when DoShorts is used locally, only accepts requests from the DoShorts page, only contacts loopback or private-network addresses, and only forwards the six ComfyUI endpoints Generate uses. Set `DOSHORTS_COMFY_BRIDGE=0` to turn it off.

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
- **It does not live in the page.** Once entered, the key is handed to a dedicated worker (`src/lib/keyring.worker.ts`) and the field is cleared. The worker has its own memory that page scripts cannot read, and it makes the provider calls itself. No message it answers returns key material.
- **Never held whole.** Inside the worker the key is split into random XOR shares, assembled only for the moment of a request, then wiped and re-split with fresh randomness.
- **Locked to one destination.** A key is bound to the origin it was entered for. The worker refuses to send it anywhere else, so even code that can talk to the worker cannot redirect the key to another address. Changing the address removes the key.
- **Never in clear text on the wire.** A key is refused for any `http://` address that is not the user's own machine. Redirects are not followed, and no cookies or referrer are sent with provider requests.
- **Never in plain storage.** Not in a URL, cookie, log or `localStorage`. By default it exists only in the worker's memory and is gone on reload. If the user ticks Remember, it is encrypted with AES-GCM under a non-extractable WebCrypto key and kept in that browser's IndexedDB, with its bound origin; unticking erases it.
- **Locked-down page.** No third-party scripts, cannot be framed, sends no referrer.
- **Deployer secrets stay on the server.** They are read from the environment only and are never sent to the browser.

Limits, stated plainly. While a request is being sent, the key briefly exists whole inside the worker. Remember is weaker than memory-only: the encrypted copy can be decrypted by any script running on this site's origin, so leave it off for the strongest protection. And nothing in a browser defends against a debugger or malware on the user's own machine. For keys that matter, use a provider key with a spend cap.

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
- **Keyring** (`src/lib/keyring.worker.ts`, `src/lib/keyring.ts`): the isolated worker that holds keys and makes provider calls. **Key vault** (`src/lib/vault.ts`): the encrypted IndexedDB store for remembered keys.
- **Free-run gate** (`src/lib/usage.ts`): applies to the built-in AI only. Counted per tool in an HMAC-signed, HTTP-only cookie and enforced in the API route. Only successful runs count.
- **Short Analyzer**: works from the title, public stats and captions when YouTube serves them, or a pasted transcript. It does not watch the video, and the result says which inputs it used. The server fetches this public YouTube data for every AI option (`/api/context`), since a browser cannot.
- **Trending Topics**: grounded in the YouTube Data API when a key is set, plus web search on the built-in Claude option. With no live source it says so instead of presenting guesses as trends.

## Not in scope

DoShorts does not generate voiceover or music, and does not upload to YouTube. It does not run inside YouTube Studio, and does not do keyword-volume research, competitor analytics, bulk tag editing, or live title and thumbnail split-testing.
