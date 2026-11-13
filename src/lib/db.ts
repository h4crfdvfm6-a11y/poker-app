import { readdir, readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
let pool: pg.Pool | undefined;
let local: Promise<PGlite> | undefined;
/** Serialize all local PGlite work — one session cannot nest concurrent BEGIN/COMMIT. */
let localGate: Promise<void> = Promise.resolve();

type SqlFn = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

function withLocalLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = localGate.then(fn, fn);
  localGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function sql<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  if (databaseUrl !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    return (await pool.query(text, params)).rows as T[];
  }
  return withLocalLock(async () => {
    local ??= startLocal().catch((error: unknown) => {
      local = undefined;
      throw error;
    });
    return (await (await local).query<T>(text, params)).rows;
  });
}

/** Run work on one connection inside BEGIN/COMMIT (ROLLBACK on throw). */
export async function withTransaction<T>(fn: (q: SqlFn) => Promise<T>): Promise<T> {
  if (databaseUrl !== "") {
    pool ??= new pg.Pool({ connectionString: databaseUrl, max: 5 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const q: SqlFn = async (text, params = []) =>
        (await client.query(text, params)).rows as never[];
      const result = await fn(q);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  return withLocalLock(async () => {
    local ??= startLocal().catch((error: unknown) => {
      local = undefined;
      throw error;
    });
    const db = await local;
    await db.query("BEGIN");
    try {
      const q: SqlFn = async (text, params = []) =>
        (await db.query(text, params)).rows as never[];
      const result = await fn(q);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });
}

async function startLocal(): Promise<PGlite> {
  const db = new PGlite();
  const files = (await readdir("migrations").catch(() => []))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(await readFile(`migrations/${file}`, "utf8"));
  }
  return db;
}
