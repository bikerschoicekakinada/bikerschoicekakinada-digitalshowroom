// Iron-session helpers for the shop-owner admin PIN.
// Server-only: filename ends in .server.ts so the client bundle can't import it.
import { useSession } from "@tanstack/react-start/server";

export type AdminSession = { unlocked?: boolean; issuedAt?: number };

export function adminSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET is missing or too short (need 32+ chars).");
  }
  return {
    password,
    name: "bck-admin",
    maxAge: 60 * 60 * 12, // 12 hours
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function getAdminSession() {
  return useSession<AdminSession>(adminSessionConfig());
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session.data.unlocked) {
    throw new Error("Unauthorized");
  }
  return session;
}
