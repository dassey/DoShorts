"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOOLS } from "@/lib/tools";
import { useApp } from "./AppProvider";

export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

function Account() {
  const { ready, user, signIn, signOut } = useApp();
  if (!ready) return <div className="h-9" />;
  if (!user) {
    return (
      <button
        onClick={signIn}
        className="flex h-9 items-center gap-2 rounded-full border border-line bg-raised px-3.5 text-sm font-medium hover:border-mute"
      >
        <GoogleMark /> Sign in
      </button>
    );
  }
  return (
    <div className="flex h-9 items-center gap-2 text-sm">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
      ) : (
        <span className="grid size-7 place-items-center rounded-full bg-lime font-semibold text-ink">
          {user.name[0]?.toUpperCase()}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-mute max-lg:hidden">{user.name}</span>
      <button onClick={signOut} className="text-mute underline-offset-4 hover:text-text hover:underline">
        Sign out
      </button>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1240px] flex-col lg:flex-row">
      <header className="z-10 border-line bg-ink max-lg:sticky max-lg:top-0 max-lg:border-b lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:py-6">
        <div className="flex items-center justify-between px-4 py-3 lg:px-5 lg:py-0">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="grid h-7 w-[18px] place-items-center rounded-[5px] bg-lime">
              <span className="ml-0.5 border-y-[5px] border-l-[7px] border-y-transparent border-l-ink" />
            </span>
            DoShorts
          </Link>
          <div className="lg:hidden">
            <Account />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0">
          {TOOLS.map((t) => {
            const active = path === `/${t.slug}`;
            return (
              <Link
                key={t.slug}
                href={`/${t.slug}`}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-raised font-medium text-text" : "text-mute hover:text-text"
                }`}
              >
                <span className={`mr-2 inline-block size-1.5 rounded-full align-middle ${active ? "bg-lime" : "bg-line"}`} />
                {t.name}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-5 max-lg:hidden">
          <Account />
        </div>
      </header>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 lg:py-12">{children}</main>
    </div>
  );
}
