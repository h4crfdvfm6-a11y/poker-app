/**
 * Process-local admin PIN brute-force throttle.
 * Global (not IP-keyed) so clients cannot rotate spoofed forwarding headers.
 * Attempts are serialized so concurrent requests cannot burst past the cap.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const GLOBAL_KEY = "admin-pin";

type Bucket = {
  failures: number;
  windowStarted: number;
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();
let gate: Promise<void> = Promise.resolve();

function bucket(now: number): Bucket {
  let b = buckets.get(GLOBAL_KEY);
  if (!b || (b.lockedUntil <= now && now - b.windowStarted > WINDOW_MS)) {
    b = { failures: 0, windowStarted: now, lockedUntil: 0 };
    buckets.set(GLOBAL_KEY, b);
  }
  return b;
}

/** Run admin-login critical section one at a time in this process. */
export function withAdminLoginGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn);
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function adminLoginBlocked(): { blocked: true; retryAfterSec: number } | null {
  const now = Date.now();
  const b = bucket(now);
  if (b.lockedUntil > now) {
    return { blocked: true, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  return null;
}

export function recordAdminLoginFailure(): {
  locked: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  const b = bucket(now);
  if (b.lockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((b.lockedUntil - now) / 1000) };
  }
  if (now - b.windowStarted > WINDOW_MS) {
    b.failures = 0;
    b.windowStarted = now;
  }
  b.failures += 1;
  if (b.failures >= MAX_FAILURES) {
    b.lockedUntil = now + LOCKOUT_MS;
    return { locked: true, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function clearAdminLoginFailures() {
  buckets.delete(GLOBAL_KEY);
}
