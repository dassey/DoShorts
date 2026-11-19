// ComfyUI: connection, the workflows DoShorts runs, and the graphs it sends.
//
// Every workflow uses only nodes that ship with ComfyUI. The image and video
// workflows follow ComfyUI's own bundled blueprints ("Image to Video (MiniMax
// H3)", "Text to Image (Z-Image-Turbo)" and "Text to Video (Wan 2.2)"), so the
// expected model files and their download links are the official ones.

export type ComfyConnection = { host: string; port: number; modelsDir: string };

export type ModelFolder = "checkpoints" | "diffusion_models" | "text_encoders" | "vae" | "loras";

export type ModelSlot = {
  id: string;
  label: string;
  folder: ModelFolder;
  /** The file the workflow was designed for. Absent when any model of that kind works. */
  expected?: string;
  /** Other official builds of the same model that work as well. */
  also?: string[];
  url?: string;
};

type Node = { class_type: string; inputs: Record<string, unknown> };
export type Graph = Record<string, Node>;
type Ref = [string, number];

export type ShotRequest = {
  prompt: string;
  seconds: number;
  width: number;
  height: number;
  seed: number;
  models: Record<string, string>;
  negative: string;
};

export type SoundMode = "voiceover" | "background" | "silent";

/** Everything a shot's prompt is assembled from. */
export type PromptParts = {
  style: string;
  visual: string;
  motion: string;
  /** Ambient sound heard in the shot. */
  sound: string;
  /** The words spoken during the shot. */
  caption: string;
  soundMode: SoundMode;
  /** How the narrator sounds, e.g. "a warm, clear adult voice". */
  voice: string;
};

export type Workflow = {
  id: string;
  name: string;
  kind: "image" | "video";
  summary: string;
  /** The ComfyUI blueprint this follows, if any. */
  basedOn?: string;
  slots: ModelSlot[];
  sizes: [number, number][];
  fps: number;
  negative: string;
  /** The model also generates sound, including speech, for each clip. */
  sound?: boolean;
  /** Shot lengths the model handles well, in seconds. Shots outside it are rendered at the nearest end. */
  seconds: [number, number];
  /** Writes the text sent to the model for one shot. */
  prompt: (p: PromptParts) => string;
  /** Adds the nodes that render one shot. Returns its IMAGE output and, if the model makes sound, its AUDIO output. */
  frames: (g: GraphBuilder, shot: ShotRequest) => { images: Ref; audio?: Ref };
};

class GraphBuilder {
  graph: Graph = {};
  private next = 1;
  add(class_type: string, inputs: Record<string, unknown>): Ref {
    const id = String(this.next++);
    this.graph[id] = { class_type, inputs };
    return [id, 0];
  }
}

const out = (ref: Ref, index: number): Ref => [ref[0], index];

const HF = "https://huggingface.co/Comfy-Org";

const WAN_NEGATIVE =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

const plainPrompt = (p: PromptParts) => [p.visual, p.style].filter(Boolean).join(" ");
const motionPrompt = (p: PromptParts) => [p.visual, p.motion, p.style].filter(Boolean).join(" ");

const sentence = (text: string) => {
  const t = text.trim();
  return !t || /[.?!]$/.test(t) ? t : `${t}.`;
};

/**
 * MiniMax H3 reads a three-field prompt (official prompt guide): the shot, with
 * any spoken line in a <d> tag, then the ambient sound, then the score. It has
 * no negative prompt, so each field states what should be there.
 */
function h3Prompt(p: PromptParts): string {
  const spoken = p.soundMode === "voiceover" && p.caption.trim();
  const shot = [
    sentence(p.style),
    sentence(p.visual),
    sentence(p.motion),
    spoken
      ? `A narrator with ${p.voice.trim() || "a clear adult voice"} (S1) says in an off-screen voiceover: <d>[English] ${sentence(p.caption)}</d> while everyone on screen keeps their lips completely closed.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const soundscape =
    p.soundMode === "silent" ? "N/A" : sentence(p.sound) || "The natural ambient sound of the scene.";
  return `integrated_multimodal_description: [Shot 1] ${shot}\noverall_soundscape: ${soundscape}\nnon_diegetic_music: N/A`;
}

const H3 = "https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main";
const H3_SHARED: ModelSlot[] = [
  { id: "clip", label: "Text encoder", folder: "text_encoders", expected: "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors", url: `${H3}/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors` },
  { id: "vae", label: "Video VAE", folder: "vae", expected: "minimax_h3_video_vae_fp16.safetensors", also: ["minimax_h3_video_vae_int8_convrot.safetensors"], url: `${H3}/vae/minimax_h3_video_vae_fp16.safetensors` },
  { id: "audioVae", label: "Audio VAE", folder: "vae", expected: "minimax_h3_audio_vae_fp32.safetensors", url: `${H3}/vae/minimax_h3_audio_vae_fp32.safetensors` },
];

/** The part every H3 workflow shares: text and latent setup, 8-step sampling, video and audio decode. */
function h3Render(g: GraphBuilder, s: ShotRequest, model: Ref, fps: number) {
  const clip = g.add("CLIPLoader", { clip_name: s.models.clip, type: "minimax", device: "default" });
  const vae = g.add("VAELoader", { vae_name: s.models.vae });
  const audioVae = g.add("VAELoader", { vae_name: s.models.audioVae });
  // H3 wants a frame count on its 17k+5 grid.
  const raw = Math.max(5, Math.round(s.seconds * fps));
  const length = raw + ((5 - (raw % 17) + 17) % 17);
  // No first frame is connected, so the clip is generated from the text alone.
  const setup = g.add("MiniMaxH3ImageToVideo", { clip, vae, prompt: s.prompt, width: s.width, height: s.height, length });
  const noise = g.add("RandomNoise", { noise_seed: s.seed });
  const sampler = g.add("KSamplerSelect", { sampler_name: "res_multistep" });
  const sigmas = g.add("BasicScheduler", { model, scheduler: "simple", steps: 8, denoise: 1 });
  const guider = g.add("BasicGuider", { model, conditioning: setup });
  const sampled = g.add("SamplerCustomAdvanced", { noise, guider, sampler, sigmas, latent_image: out(setup, 1) });
  return {
    images: g.add("VAEDecode", { samples: sampled, vae }),
    audio: g.add("VAEDecodeAudio", { samples: sampled, vae: audioVae }),
  };
}

export const WORKFLOWS: Workflow[] = [
  {
    id: "fasth3",
    name: "Video + sound · FastH3",
    kind: "video",
    summary: "The fast distilled MiniMax H3: a moving clip with sound and optional voiceover per shot, in 8 steps.",
    basedOn: "FastH3 (docs.comfy.org)",
    sound: true,
    seconds: [5, 10],
    prompt: h3Prompt,
    slots: [
      { id: "unet", label: "Diffusion model", folder: "diffusion_models", expected: "fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors", url: "https://huggingface.co/FastVideo/FastVideo-FastH3-Comfy/resolve/main/diffusion_models/fastvideo_fasth3_8step_v2_pruned_int8_convrot.safetensors" },
      ...H3_SHARED,
    ],
    sizes: [[768, 1344], [544, 960]],
    fps: 24,
    negative: "",
    frames(g, s) {
      const base = g.add("UNETLoader", { unet_name: s.models.unet, weight_dtype: "default" });
      const shifted = g.add("MiniMaxH3SigmaShift", { model: base, shift_video: 10, shift_audio: 3 });
      // FastH3 is trained for video sparse attention at 10%, starting 20% into sampling.
      const model = g.add("BlockSparseAttention", {
        model: shifted, selection: "vsa", "selection.keep_percent": 10, start_percent: 0.2, end_percent: 1,
        dense_blocks: "", min_tokens: 12288, extra_tokens: 256, sink_conditioning: "exact_kv_and_rows", verbose: false,
      });
      return h3Render(g, s, model, this.fps);
    },
  },
  {
    id: "h3",
    name: "Video + sound · MiniMax H3 Turbo",
    kind: "video",
    summary: "The full MiniMax H3 with its 8-step Turbo LoRA. Slower than FastH3, closer to full quality.",
    basedOn: "Image to Video (MiniMax H3)",
    sound: true,
    seconds: [5, 10],
    prompt: h3Prompt,
    slots: [
      { id: "unet", label: "Diffusion model", folder: "diffusion_models", expected: "minimax_h3_fl2va_pruned_int8_convrot.safetensors", url: `${H3}/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors` },
      { id: "lora", label: "Turbo LoRA", folder: "loras", expected: "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors", url: "https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/main/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors" },
      ...H3_SHARED,
    ],
    sizes: [[768, 1344], [544, 960]],
    fps: 24,
    negative: "",
    frames(g, s) {
      const base = g.add("UNETLoader", { unet_name: s.models.unet, weight_dtype: "default" });
      const model = g.add("LoraLoaderModelOnly", { model: base, lora_name: s.models.lora, strength_model: 1 });
      return h3Render(g, s, model, this.fps);
    },
  },
  {
    id: "zimage",
    name: "Stills · Z-Image Turbo",
    kind: "image",
    summary: "One image per shot, held for the shot's length. Fast: 8 steps per image.",
    basedOn: "Text to Image (Z-Image-Turbo)",
    seconds: [1, 10],
    prompt: plainPrompt,
    slots: [
      { id: "unet", label: "Diffusion model", folder: "diffusion_models", expected: "z_image_turbo_bf16.safetensors", url: `${HF}/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors` },
      { id: "clip", label: "Text encoder", folder: "text_encoders", expected: "qwen_3_4b.safetensors", url: `${HF}/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors` },
      { id: "vae", label: "VAE", folder: "vae", expected: "ae.safetensors", url: `${HF}/z_image_turbo/resolve/main/split_files/vae/ae.safetensors` },
    ],
    sizes: [[720, 1280], [1088, 1920]],
    fps: 8,
    negative: "",
    frames(g, s) {
      const unet = g.add("UNETLoader", { unet_name: s.models.unet, weight_dtype: "default" });
      const clip = g.add("CLIPLoader", { clip_name: s.models.clip, type: "lumina2", device: "default" });
      const vae = g.add("VAELoader", { vae_name: s.models.vae });
      const model = g.add("ModelSamplingAuraFlow", { model: unet, shift: 3 });
      const positive = g.add("CLIPTextEncode", { clip, text: s.prompt });
      const negative = g.add("ConditioningZeroOut", { conditioning: positive });
      const latent = g.add("EmptySD3LatentImage", { width: s.width, height: s.height, batch_size: 1 });
      const sampled = g.add("KSampler", {
        model, positive, negative, latent_image: latent,
        seed: s.seed, steps: 8, cfg: 1, sampler_name: "res_multistep", scheduler: "simple", denoise: 1,
      });
      const image = g.add("VAEDecode", { samples: sampled, vae });
      return { images: g.add("RepeatImageBatch", { image, amount: Math.round(s.seconds * this.fps) }) };
    },
  },
  {
    id: "wan22",
    name: "Video clips · Wan 2.2",
    kind: "video",
    summary: "A moving clip per shot, up to 5 seconds each. Much slower and needs a strong GPU.",
    basedOn: "Text to Video (Wan 2.2)",
    seconds: [1, 5],
    prompt: motionPrompt,
    slots: [
      { id: "high", label: "Diffusion model (high noise)", folder: "diffusion_models", expected: "wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors", url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp8_scaled.safetensors` },
      { id: "low", label: "Diffusion model (low noise)", folder: "diffusion_models", expected: "wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors", url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp8_scaled.safetensors` },
      { id: "loraHigh", label: "4-step LoRA (high noise)", folder: "loras", expected: "wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors", url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors` },
      { id: "loraLow", label: "4-step LoRA (low noise)", folder: "loras", expected: "wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors", url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors` },
      { id: "clip", label: "Text encoder", folder: "text_encoders", expected: "umt5_xxl_fp8_e4m3fn_scaled.safetensors", url: `${HF}/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors` },
      { id: "vae", label: "VAE", folder: "vae", expected: "wan_2.1_vae.safetensors", url: `${HF}/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors` },
    ],
    sizes: [[480, 832], [720, 1280]],
    fps: 16,
    negative: WAN_NEGATIVE,
    frames(g, s) {
      const clip = g.add("CLIPLoader", { clip_name: s.models.clip, type: "wan", device: "default" });
      const vae = g.add("VAELoader", { vae_name: s.models.vae });
      const stage = (unet: string, lora: string) => {
        const base = g.add("UNETLoader", { unet_name: unet, weight_dtype: "default" });
        const fast = g.add("LoraLoaderModelOnly", { model: base, lora_name: lora, strength_model: 1 });
        return g.add("ModelSamplingSD3", { model: fast, shift: 5 });
      };
      const high = stage(s.models.high, s.models.loraHigh);
      const low = stage(s.models.low, s.models.loraLow);
      const positive = g.add("CLIPTextEncode", { clip, text: s.prompt });
      const negative = g.add("CLIPTextEncode", { clip, text: s.negative });
      // Wan wants a frame count of 4n+1.
      const length = Math.round((s.seconds * this.fps) / 4) * 4 + 1;
      const latent = g.add("EmptyHunyuanLatentVideo", { width: s.width, height: s.height, length, batch_size: 1 });
      const shared = { positive, negative, steps: 4, cfg: 1, sampler_name: "euler", scheduler: "simple" };
      const first = g.add("KSamplerAdvanced", {
        ...shared, model: high, latent_image: latent, add_noise: "enable", noise_seed: s.seed,
        start_at_step: 0, end_at_step: 2, return_with_leftover_noise: "enable",
      });
      const second = g.add("KSamplerAdvanced", {
        ...shared, model: low, latent_image: first, add_noise: "disable", noise_seed: 0,
        start_at_step: 2, end_at_step: 4, return_with_leftover_noise: "disable",
      });
      return { images: g.add("VAEDecode", { samples: second, vae }) };
    },
  },
  {
    id: "checkpoint",
    name: "Stills · your own checkpoint",
    kind: "image",
    summary: "One image per shot from any SD or SDXL checkpoint you already have.",
    seconds: [1, 10],
    prompt: plainPrompt,
    slots: [{ id: "ckpt", label: "Checkpoint", folder: "checkpoints" }],
    sizes: [[768, 1344], [512, 896]],
    fps: 8,
    negative: "text, watermark, logo, blurry, low quality, deformed",
    frames(g, s) {
      const ckpt = g.add("CheckpointLoaderSimple", { ckpt_name: s.models.ckpt });
      const positive = g.add("CLIPTextEncode", { clip: out(ckpt, 1), text: s.prompt });
      const negative = g.add("CLIPTextEncode", { clip: out(ckpt, 1), text: s.negative });
      const latent = g.add("EmptyLatentImage", { width: s.width, height: s.height, batch_size: 1 });
      const sampled = g.add("KSampler", {
        model: ckpt, positive, negative, latent_image: latent,
        seed: s.seed, steps: 25, cfg: 7, sampler_name: "dpmpp_2m", scheduler: "karras", denoise: 1,
      });
      const image = g.add("VAEDecode", { samples: sampled, vae: out(ckpt, 2) });
      return { images: g.add("RepeatImageBatch", { image, amount: Math.round(s.seconds * this.fps) }) };
    },
  },
];

export type CaptionStyle = { on: boolean; position: "top" | "bottom"; size: number };

/** The full graph for one shot: frames, optional burned-in caption, saved as an mp4 clip. */
export function shotGraph(
  workflow: Workflow,
  shot: ShotRequest,
  caption: { text: string; style: CaptionStyle },
  filePrefix: string,
  mute = false,
): Graph {
  const g = new GraphBuilder();
  const rendered = workflow.frames(g, shot);
  let images = rendered.images;
  if (caption.style.on && caption.text.trim()) {
    images = g.add("TextOverlay", {
      images, text: caption.text, font_size: caption.style.size, color: "#ffffff",
      position: caption.style.position, align: "center", outline: true,
    });
  }
  const video = g.add("CreateVideo", { images, fps: workflow.fps, ...(rendered.audio && !mute ? { audio: rendered.audio } : {}) });
  g.add("SaveVideo", { video, filename_prefix: filePrefix, format: "mp4", "format.codec": "h264" });
  return g.graph;
}

export type ComfyFile = { filename: string; subfolder: string; type: string };

/** Joins finished shot clips, in order, into one mp4. */
export function joinGraph(clips: ComfyFile[], filePrefix: string): Graph {
  const g = new GraphBuilder();
  const videos: Record<string, Ref> = {};
  clips.forEach((clip, i) => {
    const path = clip.subfolder ? `${clip.subfolder}/${clip.filename}` : clip.filename;
    videos[`videos.video${i}`] = g.add("LoadVideo", { file: `${path} [${clip.type}]` });
  });
  const joined = g.add("ConcatenateVideo", { ...videos, codec: "auto" });
  g.add("SaveVideo", { video: joined, filename_prefix: filePrefix, format: "mp4", "format.codec": "h264" });
  return g.graph;
}

// ---------- Talking to ComfyUI (through the local bridge at /api/comfy) ----------

export class ComfyError extends Error {}

const bridge = (c: ComfyConnection, path: string, query: Record<string, string> = {}) =>
  `/api/comfy/${path}?${new URLSearchParams({ h: c.host, p: String(c.port), ...query })}`;

async function call<T>(c: ComfyConnection, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(bridge(c, path), {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ComfyError("Lost the connection to DoShorts.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ComfyError(describeError(data) ?? `ComfyUI returned an error (HTTP ${res.status}).`);
  return data as T;
}

/** Turns ComfyUI's validation errors into one readable line. */
function describeError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as {
    error?: string | { message?: string };
    node_errors?: Record<string, { class_type?: string; errors?: { message?: string; details?: string }[] }>;
  };
  const nodes = Object.values(d.node_errors ?? {})
    .flatMap((n) => (n.errors ?? []).map((e) => `${n.class_type}: ${e.message}${e.details ? ` (${e.details})` : ""}`))
    .slice(0, 3);
  if (nodes.length) return nodes.join(" · ");
  return typeof d.error === "string" ? d.error : (d.error?.message ?? null);
}

export type ComfyInfo = { version: string; device: string; vramGb: number | null };

export async function connect(c: ComfyConnection): Promise<ComfyInfo> {
  const stats = await call<{
    system?: { comfyui_version?: string };
    devices?: { name?: string; vram_total?: number }[];
  }>(c, "system_stats");
  if (!stats?.system) throw new ComfyError("Something answered at that address, but it is not ComfyUI.");
  const device = stats.devices?.[0];
  return {
    version: stats.system.comfyui_version ?? "unknown",
    device: device?.name ?? "unknown device",
    vramGb: device?.vram_total ? Math.round(device.vram_total / 2 ** 30) : null,
  };
}

export const installedModels = (c: ComfyConnection, folder: ModelFolder) => call<string[]>(c, `models/${folder}`);

export const fileUrl = (c: ComfyConnection, f: ComfyFile) =>
  bridge(c, "view", { filename: f.filename, subfolder: f.subfolder, type: f.type });

export const interrupt = (c: ComfyConnection) => call(c, "interrupt", {}).catch(() => {});

type History = Record<
  string,
  {
    status?: { status_str?: string; messages?: [string, { exception_message?: string; node_type?: string }][] };
    outputs?: Record<string, { images?: ComfyFile[] }>;
  }
>;

/** Queues a graph and waits for the file it saves. */
export async function render(c: ComfyConnection, graph: Graph, signal: AbortSignal): Promise<ComfyFile> {
  const { prompt_id } = await call<{ prompt_id: string }>(c, "prompt", { prompt: graph, client_id: "doshorts" }, signal);
  for (;;) {
    await new Promise((r) => setTimeout(r, 1500));
    if (signal.aborted) throw new DOMException("Stopped", "AbortError");
    const entry = (await call<History>(c, `history/${prompt_id}`, undefined, signal))[prompt_id];
    if (!entry) continue; // still queued or running
    if (entry.status?.status_str === "error") {
      const failure = entry.status.messages?.find(([kind]) => kind === "execution_error")?.[1];
      if (entry.status.messages?.some(([kind]) => kind === "execution_interrupted")) {
        throw new DOMException("Stopped", "AbortError");
      }
      throw new ComfyError(
        failure?.exception_message
          ? `${failure.node_type ?? "ComfyUI"}: ${failure.exception_message.trim().slice(0, 300)}`
          : "ComfyUI failed to render this.",
      );
    }
    const file = Object.values(entry.outputs ?? {}).flatMap((o) => o.images ?? [])[0];
    if (!file) throw new ComfyError("ComfyUI finished but saved no file.");
    return file;
  }
}
