import {
  clearThrottle,
  recordThrottleFailure,
  throttleBlocked,
} from "./security-throttle";

const KEY = "club-invite";
const MAX_FAILURES = 10;

export async function inviteGuessBlocked(): Promise<
  { blocked: true; retryAfterSec: number } | null
> {
  return throttleBlocked(KEY);
}

export async function recordInviteGuessFailure(): Promise<{
  locked: boolean;
  retryAfterSec: number;
}> {
  return recordThrottleFailure(KEY, MAX_FAILURES);
}

export async function clearInviteGuessFailures() {
  await clearThrottle(KEY);
}
