/** Ephemeral table reactions — process memory, short-lived, rate-limited. */

export type Reaction = {
  id: string;
  tableId: string;
  seat: number;
  emoji: string;
  name: string;
  at: number;
};

const FREE = ["😂", "😎", "🔥", "😱", "👏", "❤️", "😭", "🤔", "🎉"];
const FIRE_PACK = ["💥", "🚀", "🫠", "👀"];

const byTable = new Map<string, Reaction[]>();
const lastByMember = new Map<string, number>();
const COOLDOWN_MS = 4000;
const TTL_MS = 3500;

export function freeEmojis() {
  return FREE;
}

export function postReaction(input: {
  tableId: string;
  memberId: string;
  seat: number;
  name: string;
  emoji: string;
  allowFirePack?: boolean;
}): Reaction {
  const allowed = input.allowFirePack ? [...FREE, ...FIRE_PACK] : FREE;
  if (!allowed.includes(input.emoji)) throw new Error("Unknown reaction");
  const now = Date.now();
  const last = lastByMember.get(input.memberId) ?? 0;
  if (now - last < COOLDOWN_MS) throw new Error("Slow down reactions");
  lastByMember.set(input.memberId, now);
  const reaction: Reaction = {
    id: `rx_${now}_${input.seat}`,
    tableId: input.tableId,
    seat: input.seat,
    emoji: input.emoji,
    name: input.name,
    at: now,
  };
  const list = byTable.get(input.tableId) ?? [];
  list.push(reaction);
  byTable.set(
    input.tableId,
    list.filter((r) => now - r.at < TTL_MS * 3).slice(-20),
  );
  return reaction;
}

export function listReactions(tableId: string): Reaction[] {
  const now = Date.now();
  const list = (byTable.get(tableId) ?? []).filter((r) => now - r.at < TTL_MS);
  byTable.set(tableId, list);
  return list;
}
