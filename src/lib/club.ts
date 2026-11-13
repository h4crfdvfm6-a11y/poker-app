import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { id } from "./ids";

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
};

export async function ensureClubSeeded() {
  const existing = await sql<{ id: string }>(
    "select id from clubs where id = $1",
    [DEFAULT_CLUB_ID],
  );
  if (existing.length) return;

  await sql(
    "insert into clubs (id, name, invite_code) values ($1, $2, $3)",
    [DEFAULT_CLUB_ID, "FA Poker Club", clubInviteCode()],
  );
  await sql(
    "insert into bbjp_settings (club_id, balance, enabled, trigger_hand) values ($1, 0, false, $2)",
    [DEFAULT_CLUB_ID, "AAAJJ"],
  );
  await sql(
    "insert into club_rake (club_id, total_rake) values ($1, 0)",
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
  const [bbjp] = await sql<{ balance: string; enabled: boolean; trigger_hand: string }>(
    "select balance, enabled, trigger_hand from bbjp_settings where club_id = $1",
    [clubId],
  );
  const [rake] = await sql<{ total_rake: string }>(
    "select total_rake from club_rake where club_id = $1",
    [clubId],
  );
  return {
    club,
    members: Number(members[0]?.c ?? 0),
    openTables: Number(tables[0]?.c ?? 0),
    activeTournaments: Number(tournaments[0]?.c ?? 0),
    bbjp,
    totalRake: num(rake?.total_rake ?? 0),
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
  sb: number;
  bb: number;
  seats: number;
  buyinMin: number;
  buyinMax: number;
  rakePercent: number;
  rakeCapBb: number;
  bbjpEnabled: boolean;
  isPrivate: boolean;
}) {
  await ensureClubSeeded();
  if (input.rakePercent < 0 || input.rakePercent > 20) {
    throw new Error("Rake percent must be between 0 and 20");
  }
  const tableId = id("tbl");
  await sql(
    `insert into cash_tables (
      id, club_id, title, game_type, format, sb, bb, seats,
      buyin_min, buyin_max, rake_percent, rake_cap_bb, bbjp_enabled, is_private, status
    ) values ($1,$2,$3,'NLH','ring',$4,$5,$6,$7,$8,$9,$10,$11,$12,'open')`,
    [
      tableId,
      DEFAULT_CLUB_ID,
      input.title.trim(),
      input.sb,
      input.bb,
      input.seats,
      input.buyinMin,
      input.buyinMax,
      input.rakePercent,
      input.rakeCapBb,
      input.bbjpEnabled,
      input.isPrivate,
    ],
  );
  const [table] = await sql<CashTable>("select * from cash_tables where id = $1", [
    tableId,
  ]);
  return table;
}

export async function closeTable(tableId: string) {
  await sql(
    "update cash_tables set status = 'closed' where id = $1 and club_id = $2",
    [tableId, DEFAULT_CLUB_ID],
  );
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
}) {
  await ensureClubSeeded();
  const tournamentId = id("mtt");
  await sql(
    `insert into tournaments (
      id, club_id, title, buy_in, fee, starting_stack, max_players, blind_minutes, status, starts_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,'scheduled',$9)`,
    [
      tournamentId,
      DEFAULT_CLUB_ID,
      input.title.trim(),
      input.buyIn,
      input.fee,
      input.startingStack,
      input.maxPlayers,
      input.blindMinutes,
      input.startsAt || null,
    ],
  );
  const rows = await listTournaments();
  return rows.find((t) => t.id === tournamentId)!;
}

export async function getBbjp(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  const [row] = await sql<{
    balance: string;
    enabled: boolean;
    trigger_hand: string;
  }>("select balance, enabled, trigger_hand from bbjp_settings where club_id = $1", [
    clubId,
  ]);
  const topups = await sql<{ id: string; amount: string; created_at: string }>(
    `select id, amount, created_at from bbjp_topups where club_id = $1 order by created_at desc limit 20`,
    [clubId],
  );
  return { ...row, topups };
}

export async function topUpBbjp(amount: number) {
  if (!Number.isFinite(amount) || amount < 100) {
    throw new Error("BBJP top-up must be at least 100 chips");
  }
  await ensureClubSeeded();
  await sql(
    "update bbjp_settings set balance = balance + $1, updated_at = now() where club_id = $2",
    [amount, DEFAULT_CLUB_ID],
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

export async function setBbjpTrigger(triggerHand: string) {
  await ensureClubSeeded();
  await sql(
    "update bbjp_settings set trigger_hand = $1, updated_at = now() where club_id = $2",
    [triggerHand, DEFAULT_CLUB_ID],
  );
  return getBbjp();
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
  const [club] = await sql<{ id: string; invite_code: string }>(
    "select id, invite_code from clubs where upper(invite_code) = upper($1)",
    [inviteCode.trim()],
  );
  if (!club) throw new Error("Invalid club invite code");

  const members = await sql<{ c: string }>(
    `select count(*)::text as c from members
     where club_id = $1 and role = 'player' and status = 'active'`,
    [club.id],
  );
  if (Number(members[0]?.c ?? 0) >= MAX_CLUB_MEMBERS) {
    throw new Error("Club is full");
  }

  const recent = await sql<{ c: string }>(
    `select count(*)::text as c from members
     where club_id = $1
       and role = 'player'
       and created_at > now() - ($2 || ' minutes')::interval`,
    [club.id, String(JOIN_WINDOW_MINUTES)],
  );
  if (Number(recent[0]?.c ?? 0) >= MAX_JOINS_PER_WINDOW) {
    throw new Error("Too many joins right now — try again later");
  }

  return addMember(displayName, WELCOME_CHIPS);
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

  return getTournament(tournamentId);
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

  const deleted = await sql(
    `delete from tournament_entries
     where tournament_id = $1 and member_id = $2
     returning member_id`,
    [tournamentId, memberId],
  );
  if (!deleted.length) throw new Error("Not registered");

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
