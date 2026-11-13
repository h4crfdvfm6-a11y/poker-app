import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "fa_admin";
const PLAYER_COOKIE = "fa_player";
const ADMIN_TTL_SEC = 60 * 60 * 8; // 8 hours — shorter than a long-lived club session
const PLAYER_TTL_SEC = 60 * 60 * 24 * 30;

/** Process-local fallback only — never a shipped constant. */
let ephemeralSessionSecret: string | null = null;

export function adminPinConfigured(): boolean {
  return Boolean(process.env.ADMIN_PIN?.trim());
}

export function adminPinOk(pin: string): boolean {
  const expected = process.env.ADMIN_PIN?.trim();
  if (!expected) return false;
  const a = Buffer.from(pin.trim());
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production (bind it in Cursor secrets)",
    );
  }
  // Dev-only ephemeral secret so local sessions work without env.
  ephemeralSessionSecret ??= randomBytes(32).toString("hex");
  return ephemeralSessionSecret;
}

function signToken(payload: string, ttlSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = `${payload}.${exp}`;
  const sig = createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [payload, expStr, sig] = parts;
  if (!payload || !expStr || !sig) return null;
  const body = `${payload}.${expStr}`;
  const expected = createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setAdminSession() {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, signToken("admin", ADMIN_TTL_SEC), cookieOpts(ADMIN_TTL_SEC));
}

export async function clearAdminSession() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifyToken(jar.get(ADMIN_COOKIE)?.value) === "admin";
}

export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return Response.json({ error: "Admin login required" }, { status: 401 });
}

export async function setPlayerSession(memberId: string) {
  const jar = await cookies();
  jar.set(
    PLAYER_COOKIE,
    signToken(memberId, PLAYER_TTL_SEC),
    cookieOpts(PLAYER_TTL_SEC),
  );
}

export async function getPlayerId(): Promise<string | null> {
  const jar = await cookies();
  const payload = verifyToken(jar.get(PLAYER_COOKIE)?.value);
  if (!payload || payload === "admin") return null;
  return payload;
}
