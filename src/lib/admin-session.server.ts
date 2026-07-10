/* eslint-disable react-hooks/rules-of-hooks */
// Iron-session helpers for the shop-owner admin PIN.
// Server-only: filename ends in .server.ts so the client bundle can't import it.
import { useSession } from "@tanstack/react-start/server";

export type AdminSession = { unlocked?: boolean; issuedAt?: number };

export function adminSessionConfig() {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    const message = "SESSION_SECRET is missing or too short (need 32+ chars).";
    console.error(`[Session] ${message}`);
    throw new Error("Server configuration error. Please contact the administrator.");
  }
  return {
    password,
    name: "bck-admin",
    maxAge: 60 * 60 * 24, // 24 hours
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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
  const issuedAt = session.data.issuedAt ?? 0;
  const now = Date.now();
  if (now - issuedAt > 1000 * 60 * 60 * 24) {
    await session.clear();
    throw new Error("Unauthorized");
  }
  return session;
}
