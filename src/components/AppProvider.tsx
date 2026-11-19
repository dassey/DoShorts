"use client";

import { signIn as nextSignIn, signOut as nextSignOut } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ToolSlug } from "@/lib/tools";

type User = { name: string; email: string; image: string | null };
type Remaining = Record<ToolSlug, number> | null;

type AppState = {
  ready: boolean;
  user: User | null;
  /** Free runs left per tool for anonymous visitors; null when signed in. */
  remaining: Remaining;
  setRemaining: (r: Remaining) => void;
  signIn: () => void;
  signOut: () => void;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [remaining, setRemaining] = useState<Remaining>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me")
      .then((r) => r.json())
      .then((d: { user: User | null; remaining: Remaining }) => {
        if (!live) return;
        setUser(d.user);
        setRemaining(d.remaining);
      })
      .catch(() => {})
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback(() => void nextSignIn("google", { callbackUrl: window.location.href }), []);
  const signOut = useCallback(() => void nextSignOut({ callbackUrl: "/" }), []);

  const value = useMemo(
    () => ({ ready, user, remaining, setRemaining, signIn, signOut }),
    [ready, user, remaining, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}
