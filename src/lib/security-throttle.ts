import { sql, withTransaction } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

async function ensureTable() {
  await sql(
    `create table if not exists security_throttle (
       key text primary key,
       failures integer not null default 0,
       window_started timestamptz not null default now(),
       locked_until timestamptz
     )`,
  );
}

export async function throttleBlocked(
  key: string,
): Promise<{ blocked: true; retryAfterSec: number } | null> {
  await ensureTable();
  const rows = await sql<{ locked_until: string | null }>(
    `select locked_until from security_throttle where key = $1`,
    [key],
  );
  const locked = rows[0]?.locked_until ? new Date(rows[0].locked_until).getTime() : 0;
  const now = Date.now();
  if (locked > now) {
    return { blocked: true, retryAfterSec: Math.ceil((locked - now) / 1000) };
  }
  return null;
}

export async function recordThrottleFailure(
  key: string,
  maxFailures: number,
): Promise<{ locked: boolean; retryAfterSec: number }> {
  await ensureTable();
  return withTransaction(async (q) => {
    const rows = await q<{
      failures: number;
      window_started: string;
      locked_until: string | null;
    }>(
      `select failures, window_started, locked_until
       from security_throttle where key = $1 for update`,
      [key],
    );
    const now = Date.now();
    let failures = 0;
    let windowStarted = now;
    let lockedUntil = 0;

    if (rows[0]) {
      lockedUntil = rows[0].locked_until
        ? new Date(rows[0].locked_until).getTime()
        : 0;
      if (lockedUntil > now) {
        return {
          locked: true,
          retryAfterSec: Math.ceil((lockedUntil - now) / 1000),
        };
      }
      windowStarted = new Date(rows[0].window_started).getTime();
      failures = rows[0].failures;
      if (now - windowStarted > WINDOW_MS) {
        failures = 0;
        windowStarted = now;
      }
    }

    failures += 1;
    let locked = false;
    let retryAfterSec = 0;
    if (failures >= maxFailures) {
      lockedUntil = now + LOCKOUT_MS;
      locked = true;
      retryAfterSec = Math.ceil(LOCKOUT_MS / 1000);
    }

    await q(
      `insert into security_throttle (key, failures, window_started, locked_until)
       values ($1, $2, $3::timestamptz, $4::timestamptz)
       on conflict (key) do update set
         failures = excluded.failures,
         window_started = excluded.window_started,
         locked_until = excluded.locked_until`,
      [
        key,
        failures,
        new Date(windowStarted).toISOString(),
        locked ? new Date(lockedUntil).toISOString() : null,
      ],
    );
    return { locked, retryAfterSec };
  });
}

export async function clearThrottle(key: string) {
  await ensureTable();
  await sql(`delete from security_throttle where key = $1`, [key]);
}
