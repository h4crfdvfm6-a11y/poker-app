import { sql } from "./db";
import { id } from "./ids";

export const DEFAULT_CLUB_ID = "club_fa_poker";
export const DEFAULT_INVITE = "FAPOKER";
export const DEFAULT_ADMIN_PIN = "FAADMIN";

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
};

export async function ensureClubSeeded() {
  const existing = await sql<{ id: string }>(
    "select id from clubs where id = $1",
    [DEFAULT_CLUB_ID],
  );
  if (existing.length) return;

  await sql(
    "insert into clubs (id, name, invite_code) values ($1, $2, $3)",
    [DEFAULT_CLUB_ID, "FA Poker Club", DEFAULT_INVITE],
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
  const [member] = await sql<Member>("select * from members where id = $1", [
    memberId,
  ]);
  if (!member) throw new Error("Player not found");
  const next = num(member.chip_balance) + amount;
  if (next < 0) throw new Error("Insufficient chips");
  await sql("update members set chip_balance = $1 where id = $2", [
    next,
    memberId,
  ]);
  await sql(
    `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
     values ($1, $2, $3, $4, $5, 'admin')`,
    [id("led"), DEFAULT_CLUB_ID, memberId, amount, reason],
  );
  const [updated] = await sql<Member>("select * from members where id = $1", [
    memberId,
  ]);
  return updated;
}

export async function listTables(clubId = DEFAULT_CLUB_ID) {
  await ensureClubSeeded();
  return sql<CashTable>(
    `select * from cash_tables where club_id = $1 order by created_at desc`,
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
  const [club] = await sql<{ id: string; invite_code: string }>(
    "select id, invite_code from clubs where upper(invite_code) = upper($1)",
    [inviteCode.trim()],
  );
  if (!club) throw new Error("Invalid club invite code");
  return addMember(displayName, 5000);
}
