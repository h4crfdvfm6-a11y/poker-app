/**
 * Process-local admin PIN brute-force throttle.
 * Enough for a single club host; resets on process restart.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

type Bucket = {
  failures: number;
  windowStarted: number;
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  for (const [key, b] of buckets) {
    if (b.lockedUntil < now && now - b.windowStarted > WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return `ip:${first}`;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return `ip:${realIp}`;
  return "ip:unknown";
}

export function adminLoginBlocked(key: string): { blocked: true; retryAfterSec: number } | null {
  const now = Date.now();
  prune(now);
  const b = buckets.get(key);
  if (!b) return null;
  if (b.lockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  return null;
}

export function recordAdminLoginFailure(key: string): {
  locked: boolean;
  retryAfterSec: number;
  remaining: number;
} {
  const now = Date.now();
  prune(now);
  let b = buckets.get(key);
  if (!b || now - b.windowStarted > WINDOW_MS) {
    b = { failures: 0, windowStarted: now, lockedUntil: 0 };
    buckets.set(key, b);
  }
  b.failures += 1;
  if (b.failures >= MAX_FAILURES) {
    b.lockedUntil = now + LOCKOUT_MS;
    return { locked: true, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000), remaining: 0 };
  }
  return {
    locked: false,
    retryAfterSec: 0,
    remaining: Math.max(0, MAX_FAILURES - b.failures),
  };
}

export function clearAdminLoginFailures(key: string) {
  buckets.delete(key);
}
