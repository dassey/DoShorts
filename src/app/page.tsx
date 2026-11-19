import Link from "next/link";
import { TOOLS } from "@/lib/tools";

const FLOW = ["Find a topic", "Pick a title and hook", "Write the script", "Plan the week", "Fix what underperforms"];

export default function Home() {
  return (
    <div className="max-w-4xl">
      <p className="font-mono text-xs tracking-widest text-lime uppercase">AI toolkit for short-form video</p>
      <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
        Know the title, the hook and the script before you hit record.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-mute">
        DoShorts turns one topic into five titles, ten hooks, four thumbnail concepts and a timed script. It also scores
        titles, diagnoses a Short that flopped, finds what is moving in your niche and plans your week.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link href="/copilot" className="rounded-full bg-lime px-6 py-3 text-sm font-semibold text-ink hover:opacity-90">
          Start with a topic
        </Link>
        <p className="text-sm text-mute">
          Free. Runs on{" "}
          <Link href="/settings" className="text-text underline underline-offset-4">
            the AI you choose
          </Link>
          , local models included.
        </p>
      </div>

      <ol className="mt-14 flex flex-wrap gap-x-2 gap-y-2 text-sm text-mute">
        {FLOW.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            <span className="font-mono text-xs text-lime">{i + 1}</span>
            {step}
            {i < FLOW.length - 1 && <span className="mx-1 text-line">/</span>}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t, i) => (
          <Link
            key={t.slug}
            href={`/${t.slug}`}
            className={`group rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-lime/60 ${
              i === 0 ? "sm:col-span-2 lg:col-span-2" : ""
            }`}
          >
            <h2 className="flex items-center justify-between text-lg font-semibold">
              {t.name}
              <span className="text-mute transition-transform group-hover:translate-x-0.5 group-hover:text-lime">→</span>
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-mute">{t.tagline}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
