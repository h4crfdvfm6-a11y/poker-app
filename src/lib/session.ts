import { cookies } from "next/headers";
import { DEFAULT_ADMIN_PIN } from "./club";

const ADMIN_COOKIE = "fa_admin";
const PLAYER_COOKIE = "fa_player";

export function adminPinOk(pin: string): boolean {
  const expected = process.env.ADMIN_PIN?.trim() || DEFAULT_ADMIN_PIN;
  return pin.trim() === expected;
}

export async function setAdminSession() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === "1";
}

export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json({ error: "Admin login required" }, { status: 401 });
}

export async function setPlayerSession(memberId: string) {
  const jar = await cookies();
  jar.set(PLAYER_COOKIE, memberId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getPlayerId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PLAYER_COOKIE)?.value ?? null;
}
