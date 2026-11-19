import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { FREE_USES_PER_TOOL, TOOLS, type ToolSlug } from "./tools";

// Anonymous usage lives in a signed cookie: tamper-proof, no database.
// Clearing cookies resets it, which is acceptable for a free-trial gate.

const COOKIE = "ds_usage";
export type Usage = Partial<Record<ToolSlug, number>>;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is required in production");
  return "doshorts-dev-secret";
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export async function readUsage(): Promise<Usage> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return {};
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return {};
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return {};
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    const usage: Usage = {};
    for (const { slug } of TOOLS) {
      const n = parsed[slug];
      if (typeof n === "number" && n > 0) usage[slug] = Math.floor(n);
    }
    return usage;
  } catch {
    return {};
  }
}

export async function writeUsage(usage: Usage) {
  const payload = Buffer.from(JSON.stringify(usage)).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export function remainingFor(usage: Usage): Record<ToolSlug, number> {
  return Object.fromEntries(
    TOOLS.map((t) => [t.slug, Math.max(0, FREE_USES_PER_TOOL - (usage[t.slug] ?? 0))]),
  ) as Record<ToolSlug, number>;
}
