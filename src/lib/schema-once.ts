/** Run schema DDL at most once per process to avoid ALTER locks on every request. */
const ready = new Set<string>();
const inflight = new Map<string, Promise<void>>();

export async function ensureOnce(
  key: string,
  setup: () => Promise<void>,
): Promise<void> {
  if (ready.has(key)) return;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      await setup();
      ready.add(key);
      inflight.delete(key);
    })().catch((error) => {
      inflight.delete(key);
      throw error;
    });
    inflight.set(key, pending);
  }
  await pending;
}
