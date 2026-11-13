/**
 * Admin PIN brute-force throttle backed by security_throttle (shared across instances).
 */

import {
  clearThrottle,
  recordThrottleFailure,
  throttleBlocked,
} from "./security-throttle";

const KEY = "admin-pin";
const MAX_FAILURES = 5;

let gate: Promise<void> = Promise.resolve();

/** Serialize admin-login critical section in this process. */
export function withAdminLoginGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = gate.then(fn, fn);
  gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function adminLoginBlocked(): Promise<
  { blocked: true; retryAfterSec: number } | null
> {
  return throttleBlocked(KEY);
}

export async function recordAdminLoginFailure(): Promise<{
  locked: boolean;
  retryAfterSec: number;
}> {
  return recordThrottleFailure(KEY, MAX_FAILURES);
}

export async function clearAdminLoginFailures() {
  await clearThrottle(KEY);
}
