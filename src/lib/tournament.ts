import { sql } from "./db";
import { id } from "./ids";
import {
  DEFAULT_CLUB_ID,
  ensureClubSeeded,
  getTournament,
  listTournaments,
  num,
  rollSpinMultiplier,
  sendChips,
  type Tournament,
} from "./club";

const BLIND_LEVELS: Array<[number, number]> = [
  [10, 20],
  [15, 30],
  [25, 50],
  [50, 100],
  [75, 150],
  [100, 200],
  [150, 300],
  [200, 400],
  [300, 600],
  [400, 800],
  [500, 1000],
  [700, 1400],
  [1000, 2000],
  [1500, 3000],
  [2000, 4000],
  [3000, 6000],
  [5000, 10000],
];

export function blindsForLevel(level: number): { sb: number; bb: number } {
  const idx = Math.min(Math.max(level, 1), BLIND_LEVELS.length) - 1;
  const [sb, bb] = BLIND_LEVELS[idx]!;
  return { sb, bb };
}

export type TournamentRuntime = Tournament & {
  table_id: string | null;
  blind_level: number;
  level_started_at: string | null;
  prize_pool: string | number;
  winner_member_id: string | null;
};

export async function getTournamentByTable(
  tableId: string,
): Promise<TournamentRuntime | null> {
  const rows = await sql<TournamentRuntime>(
    `select t.*, coalesce(e.c, '0') as entries
     from tournaments t
     left join (
       select tournament_id, count(*)::text as c from tournament_entries group by tournament_id
     ) e on e.tournament_id = t.id
     where t.table_id = $1
     limit 1`,
    [tableId],
  );
  return rows[0] ?? null;
}

export async function startTournament(tournamentId: string) {
  await ensureClubSeeded();
  const tournament = await getTournament(tournamentId);
  if (tournament.status !== "scheduled") {
    throw new Error("Tournament already started or finished");
  }

  const level = 1;
  const { sb, bb } = blindsForLevel(level);
  const tableId = id("tbl");
  const stack = tournament.starting_stack;

  // Claim start without table_id first (FK to cash_tables) so register/unregister lose the race.
  const claimed = await sql(
    `update tournaments
     set status = 'running',
         blind_level = $2,
         level_started_at = now(),
         prize_pool = 0
     where id = $1 and status = 'scheduled'
     returning id`,
    [tournamentId, level],
  );
  if (!claimed.length) {
    throw new Error("Tournament already started or finished");
  }

  const abortStart = async () => {
    // Only roll back our unfinished claim; never touch a linked live table.
    const reverted = await sql(
      `update tournaments
       set status = 'scheduled',
           table_id = null,
           blind_level = 1,
           level_started_at = null,
           prize_pool = 0
       where id = $1 and status = 'running' and table_id is null
       returning id`,
      [tournamentId],
    );
    if (!reverted.length) return;
    await sql(
      `delete from table_runtime
       where table_id = $1
         and not exists (select 1 from tournaments t where t.table_id = $1)`,
      [tableId],
    );
    await sql(
      `delete from table_seats
       where table_id = $1
         and not exists (select 1 from tournaments t where t.table_id = $1)`,
      [tableId],
    );
    await sql(
      `delete from cash_tables
       where id = $1
         and not exists (select 1 from tournaments t where t.table_id = $1)`,
      [tableId],
    );
  };

  let linked = false;
  try {
    const entries = await sql<{
      member_id: string;
      display_name: string;
    }>(
      `select te.member_id, m.display_name
       from tournament_entries te
       join members m on m.id = te.member_id
       where te.tournament_id = $1
       order by te.registered_at asc`,
      [tournamentId],
    );

    if (entries.length < 2) {
      throw new Error("Need at least 2 registered players to start");
    }
    if (entries.length > 9) {
      throw new Error("Single-table start supports up to 9 players");
    }

    const seats = entries.length;
    const kind = (tournament as { kind?: string }).kind || "mtt";
    let prizePool = num(tournament.buy_in) * entries.length;
    let spinMult: number | null = null;
    if (kind === "spin") {
      spinMult = rollSpinMultiplier();
      // Winner-take-all prize = buy-in × seats × multiplier / seats * seats = buy-in * mult * seats / something
      // Standard: prize pool = buy_in * multiplier (for 3-max, displayed as ×N of buy-in to winner).
      prizePool = num(tournament.buy_in) * spinMult;
      await sql(
        `update tournaments set spin_multiplier = $2 where id = $1`,
        [tournamentId, spinMult],
      );
    }
    const gameType =
      (tournament as { game_type?: string }).game_type || "NLH";

    await sql(
      `insert into cash_tables (
        id, club_id, title, game_type, format, sb, bb, seats,
        buyin_min, buyin_max, rake_percent, rake_cap_bb, bbjp_enabled, is_private, status
      ) values ($1,$2,$3,$4,'tournament',$5,$6,$7,$8,$8,0,0,false,false,'open')`,
      [
        tableId,
        DEFAULT_CLUB_ID,
        spinMult
          ? `${tournament.title} · ×${spinMult}`
          : `${tournament.title} · final table`,
        gameType,
        sb,
        bb,
        seats,
        stack,
      ],
    );

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      await sql(
        `insert into table_seats (table_id, seat_no, member_id, display_name, stack, is_bot, sitting_out)
         values ($1,$2,$3,$4,$5,false,false)`,
        [tableId, i, entry.member_id, entry.display_name, stack],
      );
    }

    await sql(
      `insert into table_runtime (table_id, hand_no, button_seat, version, phase, state_json)
       values ($1, 0, 0, 0, 'waiting', '{}')`,
      [tableId],
    );

    const linkedRows = await sql(
      `update tournaments
       set table_id = $2, prize_pool = $3
       where id = $1 and status = 'running' and table_id is null
       returning id`,
      [tournamentId, tableId, prizePool],
    );
    if (!linkedRows.length) {
      throw new Error("Tournament already started or finished");
    }
    linked = true;

    const rows = await listTournaments();
    return rows.find((t) => t.id === tournamentId)!;
  } catch (error) {
    if (!linked) await abortStart().catch(() => undefined);
    throw error;
  }
}

export async function maybeAdvanceTournamentBlinds(tableId: string) {
  const tournament = await getTournamentByTable(tableId);
  if (!tournament || tournament.status !== "running") return null;
  if (!tournament.level_started_at) return tournament;

  const minutes = Math.max(1, tournament.blind_minutes);
  const startedAt = new Date(tournament.level_started_at).getTime();
  const elapsed = Date.now() - startedAt;
  const levelsToAdvance = Math.floor(elapsed / (minutes * 60 * 1000));
  if (levelsToAdvance <= 0) return tournament;

  const newLevel = Math.min(
    tournament.blind_level + levelsToAdvance,
    BLIND_LEVELS.length,
  );
  if (newLevel === tournament.blind_level) return tournament;

  const advancedBy = newLevel - tournament.blind_level;
  const newStarted = new Date(
    startedAt + advancedBy * minutes * 60 * 1000,
  ).toISOString();
  const { sb, bb } = blindsForLevel(newLevel);

  await sql(
    `update tournaments
     set blind_level = $2, level_started_at = $3
     where id = $1`,
    [tournament.id, newLevel, newStarted],
  );
  await sql(`update cash_tables set sb = $1, bb = $2 where id = $3`, [
    sb,
    bb,
    tableId,
  ]);

  return getTournamentByTable(tableId);
}

export async function maybeFinishTournament(tableId: string) {
  const tournament = await getTournamentByTable(tableId);
  if (!tournament || tournament.status !== "running") return null;

  const alive = await sql<{
    member_id: string;
    display_name: string;
    stack: string | number;
    is_bot: boolean;
  }>(
    `select member_id, display_name, stack, is_bot
     from table_seats
     where table_id = $1 and member_id is not null and stack > 0
     order by stack desc`,
    [tableId],
  );

  if (alive.length > 1) return null;

  const winner = alive[0] ?? null;
  const winnerId = winner?.member_id ?? null;

  // Claim finish exactly once so concurrent pollers cannot double-pay.
  const claimed = await sql<TournamentRuntime>(
    `update tournaments
     set status = 'finished', winner_member_id = $2
     where id = $1 and status = 'running'
     returning *`,
    [tournament.id, winnerId],
  );
  if (!claimed.length) return null;

  const prizePool = num(claimed[0]!.prize_pool ?? tournament.prize_pool ?? 0);
  if (winner && !winner.is_bot && prizePool > 0) {
    await sendChips(winner.member_id, prizePool, `mtt_win:${tournament.id}`);
  }

  await sql(`update cash_tables set status = 'closed' where id = $1`, [tableId]);
  await sql(
    `update table_seats
     set member_id = null, display_name = '', stack = 0, is_bot = false, sitting_out = false
     where table_id = $1`,
    [tableId],
  );
  await sql(
    `update table_runtime
     set phase = 'finished', state_json = '{}', version = version + 1, updated_at = now()
     where table_id = $1`,
    [tableId],
  );

  return {
    tournamentId: tournament.id,
    winnerId,
    prizePool,
  };
}

export async function markBustedPlayers(tableId: string) {
  await sql(
    `update table_seats
     set sitting_out = true
     where table_id = $1 and member_id is not null and stack <= 0`,
    [tableId],
  );
}
