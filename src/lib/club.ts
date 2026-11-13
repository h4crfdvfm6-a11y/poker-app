import { randomBytes } from "node:crypto";
import { minimumHandFromCollections } from "./bbjp-ladder";
import { sql, withTransaction } from "./db";
import { id } from "./ids";
import {
  gameTypeLabel,
  isGameType,
  type GameType,
} from "./poker/variants";

export const DEFAULT_CLUB_ID = "club_fa_poker";
const MAX_CLUB_MEMBERS = 48;
const MAX_JOINS_PER_WINDOW = 12;
const JOIN_WINDOW_MINUTES = 30;
const WELCOME_CHIPS = 2500;

function clubInviteCode(): string {
  const fromEnv = process.env.CLUB_INVITE?.trim();
  if (fromEnv) return fromEnv.slice(0, 32);
  return randomBytes(4).toString("hex").toUpperCase();
}

export type Member = {
  id: string;
  club_id: string;
  display_name: string;
  role: string;
  chip_balance: string | number;
  status: string;
  created_at: string;
};

export type CashTable = {
  id: string;
  club_id: string;
  title: string;
  game_type: string;
  format: string;
  sb: string | number;
  bb: string | number;
  seats: number;
  buyin_min: string | number;
  buyin_max: string | number;
  rake_percent: string | number;
  rake_cap_bb: string | number;
  bbjp_enabled: boolean;
  is_private: boolean;
  status: string;
  created_at: string;
  squid_enabled?: boolean;
  squid_target?: number;
};

export type Tournament = {
  id: string;
  club_id: string;
  title: string;
  buy_in: string | number;
  fee: string | number;
  starting_stack: number;
  max_players: number;
  blind_minutes: number;
  status: string;
  starts_at: string | null;
  created_at: string;
  entries?: number;
  table_id?: string | null;
  blind_level?: number;
  level_started_at?: string | null;
  prize_pool?: string | number;
  winner_member_id?: string | null;
  kind?: string;
  spin_multiplier?: string | number | null;
  game_type?: string;
};

export async function ensureClubSeeded() {
  const existing = await sql<{ id: string }>(
    "select id from clubs where id = $1",
    [DEFAULT_CLUB_ID],
  );
  if (existing.length) {
    // Ensure schema only — never refill bot_float (that would mint chips).
    await ensureBotFloatColumn();
    return;
  }

  await sql(
    "insert into clubs (id, name, invite_code) values ($1, $2, $3)",
    [DEFAULT_CLUB_ID, "FA Poker Club", clubInviteCode()],
  );
  await sql(
    `insert into bbjp_settings (club_id, balance, enabled, trigger_hand, cycle_collections)
     values ($1, 0, false, $2, 0)`,
    [DEFAULT_CLUB_ID, "AAAKK"],
  );
  await sql(
    "insert into club_rake (club_id, total_rake, bot_float) values ($1, 0, 250000)",
    [DEFAULT_CLUB_ID],
  );

  const adminId = id("mem");
  await sql(
    `insert into members (id, club_id, display_name, role, chip_balance)
     values ($1, $2, $3, 'admin', 100000)`,
    [adminId, DEFAULT_CLUB_ID, "Club Admin"],
  );
  await sql(
    `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
     values ($1, $2, $3, 100000, 'seed', 'system')`,
    [id("led"), DEFAULT_CLUB_ID, adminId],
  );
}

export function num(v: string | number): number {
  return typeof v === "number" ? v : Number(v);
}

export async function getOverview(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  const envInvite = process.env.CLUB_INVITE?.trim();
  if (envInvite) {
    await sql("update clubs set invite_code = $1 where id = $2", [
      envInvite.slice(0, 32),
      clubId,
    ]);
  }
  const [club] = await sql<{ name: string; invite_code: string }>(
    "select name, invite_code from clubs where id = $1",
    [clubId],
  );
  const members = await sql<{ c: string }>(
    "select count(*)::text as c from members where club_id = $1 and status = 'active'",
    [clubId],
  );
  const tables = await sql<{ c: string }>(
    "select count(*)::text as c from cash_tables where club_id = $1 and status = 'open'",
    [clubId],
  );
  const tournaments = await sql<{ c: string }>(
    "select count(*)::text as c from tournaments where club_id = $1 and status in ('scheduled','running')",
    [clubId],
  );
  const bbjp = await getBbjp(clubId);
  await ensureBotFloatColumn();
  const [rake] = await sql<{ total_rake: string; bot_float: string | number }>(
    "select total_rake, bot_float from club_rake where club_id = $1",
    [clubId],
  );
  return {
    club,
    members: Number(members[0]?.c ?? 0),
    openTables: Number(tables[0]?.c ?? 0),
    activeTournaments: Number(tournaments[0]?.c ?? 0),
    bbjp: {
      balance: bbjp.balance,
      enabled: bbjp.enabled,
      trigger_hand: bbjp.trigger_hand,
      cycle_collections: bbjp.cycle_collections,
      minimum_hand: bbjp.minimum_hand,
    },
    totalRake: num(rake?.total_rake ?? 0),
    botFloat: num(rake?.bot_float ?? 0),
  };
}

export async function listMembers(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  return sql<Member>(
    `select * from members where club_id = $1 order by created_at asc`,
    [clubId],
  );
}

export async function addMember(displayName: string, startingChips = 0) {
  await ensureClubSeeded();
  const memberId = id("mem");
  await sql(
    `insert into members (id, club_id, display_name, role, chip_balance)
     values ($1, $2, $3, 'player', $4)`,
    [memberId, DEFAULT_CLUB_ID, displayName.trim(), startingChips],
  );
  if (startingChips > 0) {
    await sql(
      `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
       values ($1, $2, $3, $4, 'welcome', 'admin')`,
      [id("led"), DEFAULT_CLUB_ID, memberId, startingChips],
    );
  }
  const [member] = await sql<Member>("select * from members where id = $1", [
    memberId,
  ]);
  return member;
}

const HOUSE_MEMBER_ID = "mem_fa_house";

async function ensureHouseMember() {
  await sql(
    `insert into members (id, club_id, display_name, role, chip_balance, status)
     values ($1, $2, 'Club House', 'system', 0, 'active')
     on conflict (id) do nothing`,
    [HOUSE_MEMBER_ID, DEFAULT_CLUB_ID],
  );
}

async function ensureBotFloatColumn() {
  await sql(
    `alter table club_rake add column if not exists bot_float numeric(14, 2) not null default 0`,
  );
}

/** Debit club AI bankroll when seating a bot (prevents unbacked chip minting). */
export async function debitBotFloat(amount: number, reason: string) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Bot float debit must be positive");
  }
  await ensureClubSeeded();
  await ensureHouseMember();
  await ensureBotFloatColumn();
  const updated = await sql<{ bot_float: string | number }>(
    `update club_rake
     set bot_float = bot_float - $1, updated_at = now()
     where club_id = $2 and bot_float >= $1
     returning bot_float`,
    [amount, DEFAULT_CLUB_ID],
  );
  if (!updated.length) {
    throw new Error("Club AI float is empty — ask an admin to top it up");
  }
  await sql(
    `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
     values ($1, $2, $3, $4, $5, 'system')`,
    [id("led"), DEFAULT_CLUB_ID, HOUSE_MEMBER_ID, -amount, reason],
  );
  return num(updated[0]!.bot_float);
}

/** Return remaining bot stack to the club AI bankroll. */
export async function creditBotFloat(amount: number, reason: string) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  await ensureClubSeeded();
  await ensureHouseMember();
  await ensureBotFloatColumn();
  await sql(
    `update club_rake
     set bot_float = bot_float + $1, updated_at = now()
     where club_id = $2`,
    [amount, DEFAULT_CLUB_ID],
  );
  await sql(
    `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
     values ($1, $2, $3, $4, $5, 'system')`,
    [id("led"), DEFAULT_CLUB_ID, HOUSE_MEMBER_ID, amount, reason],
  );
  return amount;
}

export async function getBotFloat(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  await ensureBotFloatColumn();
  const rows = await sql<{ bot_float: string | number }>(
    `select bot_float from club_rake where club_id = $1`,
    [clubId],
  );
  return num(rows[0]?.bot_float ?? 0);
}

export async function topUpBotFloat(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be positive");
  }
  return creditBotFloat(amount, "bot_float_topup");
}

export async function sendChips(
  memberId: string,
  amount: number,
  reason = "admin_send",
) {
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Amount must be a non-zero number");
  }
  await ensureClubSeeded();
  const updated = await sql<Member>(
    `update members
     set chip_balance = chip_balance + $1
     where id = $2
       and chip_balance + $1 >= 0
     returning *`,
    [amount, memberId],
  );
  if (!updated.length) {
    const [member] = await sql<Member>("select * from members where id = $1", [
      memberId,
    ]);
    if (!member) throw new Error("Player not found");
    throw new Error("Insufficient chips");
  }
  await sql(
    `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
     values ($1, $2, $3, $4, $5, 'admin')`,
    [id("led"), DEFAULT_CLUB_ID, memberId, amount, reason],
  );
  return updated[0]!;
}

export async function listTables(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  return sql<CashTable>(
    `select * from cash_tables
     where club_id = $1 and format = 'ring'
     order by created_at desc`,
    [clubId],
  );
}

export async function listPublicTables(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  return sql<CashTable>(
    `select * from cash_tables
     where club_id = $1 and format = 'ring' and is_private = false
     order by created_at desc`,
    [clubId],
  );
}

export async function createTable(input: {
  title: string;
  gameType?: string;
  sb: number;
  bb: number;
  seats: number;
  buyinMin: number;
  buyinMax: number;
  rakePercent: number;
  rakeCapBb: number;
  bbjpEnabled: boolean;
  isPrivate: boolean;
  squidEnabled?: boolean;
  squidTarget?: number;
}) {
  await ensureClubSeeded();
  if (input.rakePercent < 0 || input.rakePercent > 20) {
    throw new Error("Rake percent must be between 0 and 20");
  }
  await sql(
    `alter table cash_tables
     add column if not exists squid_enabled boolean not null default false`,
  );
  await sql(
    `alter table cash_tables
     add column if not exists squid_target int not null default 3`,
  );
  const gameType: GameType = isGameType(input.gameType ?? "NLH")
    ? (input.gameType as GameType)
    : "NLH";
  // Leave room for 5 board + burns: PLO6 needs ≤7 seats on a 52-card deck.
  const maxSeats =
    gameType === "PLO6" ? 6 : gameType === "PLO5" ? 7 : gameType === "SHORT_DECK" ? 6 : 9;
  const seats = Math.max(2, Math.min(maxSeats, Math.floor(input.seats) || 6));
  const squidTarget = Math.max(1, Math.min(9, Math.floor(input.squidTarget ?? 3) || 3));
  const tableId = id("tbl");
  const title =
    input.title.trim() || `${gameTypeLabel(gameType)} ${input.sb}/${input.bb}`;
  await sql(
    `insert into cash_tables (
      id, club_id, title, game_type, format, sb, bb, seats,
      buyin_min, buyin_max, rake_percent, rake_cap_bb, bbjp_enabled, is_private,
      squid_enabled, squid_target, status
    ) values ($1,$2,$3,$4,'ring',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open')`,
    [
      tableId,
      DEFAULT_CLUB_ID,
      title,
      gameType,
      input.sb,
      input.bb,
      seats,
      input.buyinMin,
      input.buyinMax,
      input.rakePercent,
      input.rakeCapBb,
      input.bbjpEnabled,
      input.isPrivate,
      Boolean(input.squidEnabled),
      squidTarget,
    ],
  );
  const [table] = await sql<CashTable>("select * from cash_tables where id = $1", [
    tableId,
  ]);
  return table;
}

export async function closeTable(tableId: string) {
  await ensureClubSeeded();

  // Claim close exactly once so overlapping admin deletes / leave cannot double-pay.
  const claimed = await sql(
    `update cash_tables
     set status = 'closed'
     where id = $1 and club_id = $2 and status = 'open'
     returning id`,
    [tableId, DEFAULT_CLUB_ID],
  );
  if (!claimed.length) return;

  type RuntimeSeat = {
    memberId?: string;
    stack?: number;
    bet?: number;
    isBot?: boolean;
  };
  type RuntimeState = {
    street?: string;
    seats?: RuntimeSeat[];
    pots?: Array<{ amount: number }>;
    squidCollected?: number;
    squidPaidOut?: number;
  };

  await sql(
    `alter table table_runtime
     add column if not exists squid_json text not null default '{}'`,
  );

  const runtimeRows = await sql<{
    state_json: string;
    squid_json: string;
  }>(
    `select state_json, squid_json from table_runtime where table_id = $1`,
    [tableId],
  );
  const runtime = runtimeRows[0];
  let state: RuntimeState | null = null;
  if (runtime?.state_json) {
    try {
      state = JSON.parse(runtime.state_json) as RuntimeState;
    } catch {
      state = null;
    }
  }

  const midHand =
    Boolean(state?.seats?.length) &&
    Boolean(state?.street) &&
    state!.street !== "waiting" &&
    state!.street !== "showdown";

  if (midHand && state?.seats) {
    // Live pot chips live in runtime — refund stack+bet and return side pots.
    for (const seat of state.seats) {
      const refund = Math.max(0, Number(seat.stack || 0) + Number(seat.bet || 0));
      if (refund <= 0 || !seat.memberId) continue;
      if (seat.isBot) {
        await creditBotFloat(refund, `bot_table_close:${tableId}`);
      } else {
        await sendChips(seat.memberId, refund, `table_close_cashout:${tableId}`);
      }
    }
    const potLeft = (state.pots || []).reduce(
      (sum, pot) => sum + Math.max(0, Number(pot.amount || 0)),
      0,
    );
    if (potLeft > 0) {
      await creditBotFloat(potLeft, `table_close_pot:${tableId}`);
    }
    await sql(
      `update table_seats
       set member_id = null, display_name = '', stack = 0, is_bot = false, sitting_out = false
       where table_id = $1`,
      [tableId],
    );
  } else {
    // Waiting / showdown: atomically clear seats so leaveTable cannot double-cash.
    const seated = await sql<{
      member_id: string;
      stack: string | number;
      is_bot: boolean;
    }>(
      `with old as (
         select table_id, seat_no, member_id, stack, is_bot
         from table_seats
         where table_id = $1 and member_id is not null
       ),
       upd as (
         update table_seats t
         set member_id = null, display_name = '', stack = 0, is_bot = false, sitting_out = false
         from old
         where t.table_id = old.table_id
           and t.seat_no = old.seat_no
           and t.member_id = old.member_id
         returning old.member_id, old.stack, old.is_bot
       )
       select member_id, stack, is_bot from upd`,
      [tableId],
    );
    for (const seat of seated) {
      const stack = num(seat.stack);
      if (stack <= 0) continue;
      if (seat.is_bot) {
        await creditBotFloat(stack, `bot_table_close:${tableId}`);
      } else {
        await sendChips(seat.member_id, stack, `table_close_cashout:${tableId}`);
      }
    }
  }

  // Return unfinished squid pot, minus any amount already paid into stacks.
  try {
    const squid = JSON.parse(runtime?.squid_json || "{}") as { pot?: number };
    const jsonPot = Math.max(0, Number(squid.pot || 0));
    const paidOut = Math.max(0, Number(state?.squidPaidOut || 0));
    const unbanked = Math.max(0, Number(state?.squidCollected || 0));
    // Ante may be missing from squid_json even when a prior pot balance remains.
    let anteStillLoose = 0;
    if (unbanked > 0 && (midHand || state?.street === "showdown")) {
      await sql(
        `alter table table_runtime
         add column if not exists squid_ante_hand_no int not null default 0`,
      );
      const anteRows = await sql<{
        squid_ante_hand_no: number;
        hand_no: number;
      }>(
        `select squid_ante_hand_no, hand_no from table_runtime where table_id = $1`,
        [tableId],
      );
      const anteBanked =
        Number(anteRows[0]?.squid_ante_hand_no || 0) ===
        Number(anteRows[0]?.hand_no || 0);
      if (!anteBanked) anteStillLoose = unbanked;
    }
    const squidReturn = Math.max(0, jsonPot + anteStillLoose - paidOut);
    if (squidReturn > 0) {
      await creditBotFloat(squidReturn, `table_close_squid:${tableId}`);
    }
  } catch {
    /* ignore bad squid_json */
  }

  if (runtime) {
    await sql(
      `update table_runtime
       set phase = 'waiting',
           state_json = '{}',
           squid_json = '{}',
           version = version + 1,
           updated_at = now()
       where table_id = $1`,
      [tableId],
    );
  }
}

export async function listTournaments(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  return sql<Tournament & { entries: string }>(
    `select t.*, coalesce(e.c, '0') as entries
     from tournaments t
     left join (
       select tournament_id, count(*)::text as c from tournament_entries group by tournament_id
     ) e on e.tournament_id = t.id
     where t.club_id = $1
     order by t.created_at desc`,
    [clubId],
  );
}

export async function createTournament(input: {
  title: string;
  buyIn: number;
  fee: number;
  startingStack: number;
  maxPlayers: number;
  blindMinutes: number;
  startsAt?: string | null;
  kind?: "mtt" | "spin";
  gameType?: string;
}) {
  await ensureClubSeeded();
  await sql(
    `alter table tournaments add column if not exists kind text not null default 'mtt'`,
  );
  await sql(
    `alter table tournaments add column if not exists spin_multiplier numeric(10, 2)`,
  );
  await sql(
    `alter table tournaments add column if not exists game_type text not null default 'NLH'`,
  );
  const kind = input.kind === "spin" ? "spin" : "mtt";
  const maxPlayers = kind === "spin" ? 3 : input.maxPlayers;
  const startingStack = kind === "spin" ? Math.min(input.startingStack, 500) : input.startingStack;
  const blindMinutes = kind === "spin" ? 1 : input.blindMinutes;
  const title =
    input.title.trim() ||
    (kind === "spin" ? `Spin & Gold ${input.buyIn}` : "Club MTT");
  const tournamentId = id(kind === "spin" ? "spin" : "mtt");
  await sql(
    `insert into tournaments (
      id, club_id, title, buy_in, fee, starting_stack, max_players, blind_minutes,
      status, starts_at, kind, game_type
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9,$10,$11)`,
    [
      tournamentId,
      DEFAULT_CLUB_ID,
      title,
      input.buyIn,
      input.fee,
      startingStack,
      maxPlayers,
      blindMinutes,
      input.startsAt || null,
      kind,
      isGameType(input.gameType ?? "NLH") ? input.gameType : "NLH",
    ],
  );
  const rows = await listTournaments();
  return rows.find((t) => t.id === tournamentId)!;
}

/** Weighted Spin & Gold style multipliers (club chips prize = buy_in * 3 * mult / 3 for winner-take-most). */
export function rollSpinMultiplier(): number {
  const roll = Math.random();
  if (roll < 0.55) return 2;
  if (roll < 0.8) return 3;
  if (roll < 0.92) return 5;
  if (roll < 0.97) return 10;
  if (roll < 0.995) return 25;
  return 100;
}

export async function getBbjp(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  const [row] = await sql<{
    balance: string;
    enabled: boolean;
    trigger_hand: string;
    cycle_collections: string;
  }>(
    `select balance, enabled, trigger_hand, coalesce(cycle_collections, 0) as cycle_collections
     from bbjp_settings where club_id = $1`,
    [clubId],
  );
  const collections = num(row?.cycle_collections ?? 0);
  const minimumHand = minimumHandFromCollections(collections);
  // Keep stored trigger aligned with the collections ladder.
  if (row && row.trigger_hand !== minimumHand) {
    await sql(
      `update bbjp_settings set trigger_hand = $1, updated_at = now() where club_id = $2`,
      [minimumHand, clubId],
    );
  }
  const topups = await sql<{ id: string; amount: string; created_at: string }>(
    `select id, amount, created_at from bbjp_topups where club_id = $1 order by created_at desc limit 20`,
    [clubId],
  );
  return {
    balance: row?.balance ?? "0",
    enabled: Boolean(row?.enabled),
    trigger_hand: minimumHand,
    cycle_collections: collections,
    minimum_hand: minimumHand,
    topups,
  };
}

/** Add to pool + jackpot-cycle collections (top-ups count toward the ladder). */
export async function topUpBbjp(amount: number) {
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error("BBJP top-up must be at least 100 chips");
  }
  await ensureClubSeeded();
  const hand = await bumpBbjpCollections(amount);
  await sql(
    `update bbjp_settings
     set balance = balance + $1, trigger_hand = $2, updated_at = now()
     where club_id = $3`,
    [amount, hand, DEFAULT_CLUB_ID],
  );
  await sql(
    "insert into bbjp_topups (id, club_id, amount) values ($1, $2, $3)",
    [id("bbjp"), DEFAULT_CLUB_ID, amount],
  );
  return getBbjp();
}

export async function setBbjpEnabled(enabled: boolean) {
  await ensureClubSeeded();
  const [row] = await sql<{ balance: string }>(
    "select balance from bbjp_settings where club_id = $1",
    [DEFAULT_CLUB_ID],
  );
  if (enabled && num(row?.balance ?? 0) <= 0) {
    throw new Error("Top up BBJP before enabling");
  }
  await sql(
    "update bbjp_settings set enabled = $1, updated_at = now() where club_id = $2",
    [enabled, DEFAULT_CLUB_ID],
  );
  return getBbjp();
}

/** Ladder is collections-driven — manual trigger edits are ignored. */
export async function setBbjpTrigger(_triggerHand: string) {
  return getBbjp();
}

/** Increment jackpot-cycle collections and return the new ladder hand. */
export async function bumpBbjpCollections(amount: number, clubId = DEFAULT_CLUB_ID) {
  const [row] = await sql<{ cycle_collections: string }>(
    `update bbjp_settings
     set cycle_collections = coalesce(cycle_collections, 0) + $1,
         updated_at = now()
     where club_id = $2
     returning cycle_collections`,
    [amount, clubId],
  );
  const collections = num(row?.cycle_collections ?? 0);
  const hand = minimumHandFromCollections(collections);
  await sql(
    `update bbjp_settings set trigger_hand = $1 where club_id = $2`,
    [hand, clubId],
  );
  return hand;
}

/** After an approved award: new collections cycle → ladder back toward AAAKK. */
export async function resetBbjpCollectionsCycle(clubId = DEFAULT_CLUB_ID) {
  await sql(
    `update bbjp_settings
     set cycle_collections = 0,
         trigger_hand = $1,
         updated_at = now()
     where club_id = $2`,
    ["AAAKK", clubId],
  );
}

export async function joinByInvite(inviteCode: string, displayName: string) {
  await ensureClubSeeded();
  const envInvite = process.env.CLUB_INVITE?.trim();
  if (envInvite) {
    await sql("update clubs set invite_code = $1 where id = $2", [
      envInvite.slice(0, 32),
      DEFAULT_CLUB_ID,
    ]);
  }

  return withTransaction(async (q) => {
    const [club] = await q<{ id: string; invite_code: string }>(
      "select id, invite_code from clubs where upper(invite_code) = upper($1) for update",
      [inviteCode.trim()],
    );
    if (!club) throw new Error("Invalid club invite code");

    // Row lock on clubs serializes joins so count checks cannot race past caps.
    await q("select id from clubs where id = $1 for update", [club.id]);

    const members = await q<{ c: string }>(
      `select count(*)::text as c from members
       where club_id = $1 and role = 'player' and status = 'active'`,
      [club.id],
    );
    if (Number(members[0]?.c ?? 0) >= MAX_CLUB_MEMBERS) {
      throw new Error("Club is full");
    }

    const recent = await q<{ c: string }>(
      `select count(*)::text as c from members
       where club_id = $1
         and role = 'player'
         and created_at > now() - ($2 || ' minutes')::interval`,
      [club.id, String(JOIN_WINDOW_MINUTES)],
    );
    if (Number(recent[0]?.c ?? 0) >= MAX_JOINS_PER_WINDOW) {
      throw new Error("Too many joins right now — try again later");
    }

    const memberId = id("mem");
    await q(
      `alter table members add column if not exists gem_balance integer not null default 0`,
    );
    const inserted = await q<Member>(
      `insert into members (id, club_id, display_name, role, chip_balance, gem_balance)
       values ($1, $2, $3, 'player', $4, 100)
       returning *`,
      [memberId, club.id, displayName.trim(), WELCOME_CHIPS],
    );
    if (WELCOME_CHIPS > 0) {
      await q(
        `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
         values ($1, $2, $3, $4, 'welcome', 'system')`,
        [id("led"), club.id, memberId, WELCOME_CHIPS],
      );
    }
    return inserted[0]!;
  });
}

export async function getTournament(tournamentId: string) {
  await ensureClubSeeded();
  const rows = await listTournaments();
  const tournament = rows.find((t) => t.id === tournamentId);
  if (!tournament) throw new Error("Tournament not found");
  return tournament;
}

export async function listMyTournamentIds(memberId: string) {
  const rows = await sql<{ tournament_id: string }>(
    `select tournament_id from tournament_entries where member_id = $1`,
    [memberId],
  );
  return rows.map((r) => r.tournament_id);
}

export async function registerForTournament(tournamentId: string, memberId: string) {
  await ensureClubSeeded();
  const tournament = await getTournament(tournamentId);
  if (tournament.status !== "scheduled") {
    throw new Error("Tournament is not open for registration");
  }
  const entries = Number(tournament.entries ?? 0);
  if (entries >= tournament.max_players) throw new Error("Tournament is full");

  const existing = await sql(
    `select 1 from tournament_entries where tournament_id = $1 and member_id = $2`,
    [tournamentId, memberId],
  );
  if (existing.length) throw new Error("Already registered");

  const total = num(tournament.buy_in) + num(tournament.fee);
  await sendChips(memberId, -total, `mtt_register:${tournamentId}`);

  // Only keep the entry if the event is still scheduled (blocks start race).
  const inserted = await sql(
    `insert into tournament_entries (tournament_id, member_id)
     select $1, $2
     where exists (
       select 1 from tournaments where id = $1 and status = 'scheduled'
     )
     and not exists (
       select 1 from tournament_entries where tournament_id = $1 and member_id = $2
     )
     returning tournament_id`,
    [tournamentId, memberId],
  );
  if (!inserted.length) {
    await sendChips(memberId, total, `mtt_register_refund:${tournamentId}`);
    throw new Error("Tournament is not open for registration");
  }

  if (num(tournament.fee) > 0) {
    await sql(
      `update club_rake set total_rake = total_rake + $1, updated_at = now() where club_id = $2`,
      [num(tournament.fee), DEFAULT_CLUB_ID],
    );
  }

  const updated = await getTournament(tournamentId);
  if (
    (updated as { kind?: string }).kind === "spin" &&
    Number(updated.entries ?? 0) >= updated.max_players
  ) {
    const { startTournament } = await import("./tournament");
    return startTournament(tournamentId);
  }
  return updated;
}

export async function unregisterFromTournament(
  tournamentId: string,
  memberId: string,
) {
  await ensureClubSeeded();
  const tournament = await getTournament(tournamentId);
  if (tournament.status !== "scheduled") {
    throw new Error("Can only unregister before the tournament starts");
  }

  // Delete only while still scheduled so a concurrent start claim wins cleanly.
  const deleted = await sql(
    `delete from tournament_entries te
     using tournaments t
     where te.tournament_id = $1
       and te.member_id = $2
       and t.id = te.tournament_id
       and t.status = 'scheduled'
     returning te.member_id`,
    [tournamentId, memberId],
  );
  if (!deleted.length) {
    const still = await getTournament(tournamentId);
    if (still.status !== "scheduled") {
      throw new Error("Can only unregister before the tournament starts");
    }
    throw new Error("Not registered");
  }

  const refund = num(tournament.buy_in) + num(tournament.fee);
  await sendChips(memberId, refund, `mtt_unregister:${tournamentId}`);
  if (num(tournament.fee) > 0) {
    await sql(
      `update club_rake set total_rake = greatest(total_rake - $1, 0), updated_at = now() where club_id = $2`,
      [num(tournament.fee), DEFAULT_CLUB_ID],
    );
  }
  return getTournament(tournamentId);
}
