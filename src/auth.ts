import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Reads AUTH_SECRET, AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the environment.
export const { handlers, auth } = NextAuth({
  providers: [Google],
  trustHost: true,
});

export type SessionUser = { name: string; email: string; image: string | null };

/** The signed-in user, or null. Never throws: an unconfigured auth setup reads as signed out. */
export async function currentUser(): Promise<SessionUser | null> {
  try {
    const session = await auth();
    const u = session?.user;
    if (!u?.email) return null;
    return { name: u.name ?? u.email, email: u.email, image: u.image ?? null };
  } catch {
    return null;
  }
}
