import { sql, withTransaction } from "./db";
import { id } from "./ids";
import { ensureTablePlaySchema } from "./table-schema";
import {
  DEFAULT_CLUB_ID,
  bumpBbjpCollections,
  creditBotFloat,
  debitBotFloat,
  ensureClubSeeded,
  getBbjp,
  num,
  resetBbjpCollectionsCycle,
  sendChips,
} from "./club";
import {
  applyAction,
  nextButton,
  potLimitMaxTo,
  publicPot,
  serializeCards,
  startHand,
  type ActionType,
  type EngineState,
} from "./poker/engine";
import { botThinkMs, decideBotAction, styleForBot } from "./poker/bots";
import { describeMadeHand } from "./poker/hand-display";
import {
  isAllInOrFold,
  isGameType,
  isPotLimit,
  type GameType,
} from "./poker/variants";
import { getMemberCosmetics } from "./shop";
import { cardId } from "./poker/cards";
import {
  getTournamentByTable,
  markBustedPlayers,
  maybeAdvanceTournamentBlinds,
  maybeFinishTournament,
} from "./tournament";

export type SeatRow = {
  table_id: string;
  seat_no: number;
  member_id: string | null;
  display_name: string;
  stack: string | number;
  is_bot: boolean;
  sitting_out: boolean;
};

export type TableRow = {
  id: string;
  title: string;
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
  format: string;
  game_type: string;
  squid_enabled?: boolean;
  squid_target?: number;
};

export type SquidRuntime = {
  pot: number;
  scores: Record<string, number>;
  target: number;
  lastEvent: string | null;
};

async function ensureRuntime(tableId: string) {
  await ensureTablePlaySchema();
  const rows = await sql("select table_id from table_runtime where table_id = $1", [
    tableId,
  ]);
  if (!rows.length) {
    await sql(
      `insert into table_runtime (table_id, hand_no, button_seat, version, phase, state_json)
       values ($1, 0, 0, 0, 'waiting', '{}')`,
      [tableId],
    );
  }
}

async function getTable(tableId: string, allowClosed = false) {
  const [table] = await sql<TableRow>("select * from cash_tables where id = $1", [
    tableId,
  ]);
  if (!table) throw new Error("Table not found");
  if (!allowClosed && table.status !== "open") throw new Error("Table not open");
  return table;
}

async function getSeats(tableId: string) {
  return sql<SeatRow>(
    `select * from table_seats where table_id = $1 order by seat_no asc`,
    [tableId],
  );
}

async function readSquid(tableId: string, target = 3): Promise<SquidRuntime> {
  await ensureRuntime(tableId);
  const [row] = await sql<{ squid_json: string }>(
    `select squid_json from table_runtime where table_id = $1`,
    [tableId],
  );
  try {
    const parsed = JSON.parse(row?.squid_json || "{}") as Partial<SquidRuntime>;
    return {
      pot: Number(parsed.pot || 0),
      scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
      target: Number(parsed.target || target) || target,
      lastEvent: parsed.lastEvent ?? null,
    };
  } catch {
    return { pot: 0, scores: {}, target, lastEvent: null };
  }
}

async function writeSquid(tableId: string, squid: SquidRuntime) {
  await sql(
    `update table_runtime r
     set squid_json = $2, updated_at = now()
     from cash_tables t
     where r.table_id = $1
       and t.id = r.table_id
       and t.status = 'open'`,
    [tableId, JSON.stringify(squid)],
  );
}

async function claimSquidColumn(
  tableId: string,
  handNo: number,
  column: "squid_hand_no" | "squid_ante_hand_no",
): Promise<boolean> {
  await ensureRuntime(tableId);
  // Only while the table is still open — closeTable claims closed first.
  const claimed = await sql(
    `update table_runtime r
     set ${column} = $2
     from cash_tables t
     where r.table_id = $1
       and t.id = r.table_id
       and t.status = 'open'
       and r.hand_no = $2
       and r.${column} <> $2
     returning r.table_id`,
    [tableId, handNo],
  );
  return claimed.length > 0;
}

/**
 * Award a squid to the main-pot winner.
 * When payStacks is true, credit the squid pot onto the winner's stack
 * (call before writeRuntime). Settlement after write persists JSON only.
 */
function awardSquid(
  state: EngineState,
  squid: SquidRuntime,
  payStacks = true,
): SquidRuntime {
  if (!state.result?.winners?.length) return squid;
  const winnerSeat = state.result.winners[0]!.seat;
  const winner = state.seats.find((s) => s.seat === winnerSeat);
  if (!winner?.memberId) return squid;
  const scores = { ...squid.scores };
  scores[winner.memberId] = (scores[winner.memberId] || 0) + 1;
  const count = scores[winner.memberId]!;
  if (count >= squid.target && squid.pot > 0) {
    if (payStacks) {
      winner.stack += squid.pot;
      state.squidPaidOut = (state.squidPaidOut || 0) + squid.pot;
    }
    state.log.push(
      `${winner.name} wins squid pot ${squid.pot} (${count}/${squid.target})`,
    );
    return {
      pot: 0,
      scores: {},
      target: squid.target,
      lastEvent: `${winner.name} claimed squid pot`,
    };
  }
  state.log.push(`${winner.name} earns a squid (${count}/${squid.target})`);
  return {
    ...squid,
    scores,
    lastEvent: `${winner.name} squid ${count}/${squid.target}`,
  };
}

/** Bank this hand's squid ante into the pot (once per hand, atomic). */
async function bankSquidAnte(
  tableId: string,
  state: EngineState,
  table: TableRow,
) {
  if (!table.squid_enabled || table.format === "tournament") return;
  const collected = state.squidCollected || 0;
  if (collected <= 0) return;
  await ensureRuntime(tableId);
  await withTransaction(async (q) => {
    const open = await q(
      `select 1 from cash_tables where id = $1 and status = 'open' for update`,
      [tableId],
    );
    if (!open.length) return;
    const claimed = await q<{ squid_json: string }>(
      `update table_runtime
       set squid_ante_hand_no = $2
       where table_id = $1
         and hand_no = $2
         and squid_ante_hand_no <> $2
       returning squid_json`,
      [tableId, state.handNo],
    );
    if (!claimed.length) return;
    let squid: SquidRuntime;
    try {
      const parsed = JSON.parse(claimed[0]!.squid_json || "{}") as Partial<SquidRuntime>;
      squid = {
        pot: Number(parsed.pot || 0),
        scores:
          parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
        target: Number(parsed.target || table.squid_target || 3) || 3,
        lastEvent: parsed.lastEvent ?? null,
      };
    } catch {
      squid = {
        pot: 0,
        scores: {},
        target: Number(table.squid_target || 3) || 3,
        lastEvent: null,
      };
    }
    squid = {
      ...squid,
      pot: squid.pot + collected,
      lastEvent: `Squid ante +${collected}`,
    };
    await q(
      `update table_runtime set squid_json = $2, updated_at = now() where table_id = $1`,
      [tableId, JSON.stringify(squid)],
    );
  });
}

/**
 * Persist squid scores once per showdown after a successful runtime write.
 * Credits the pot onto stacks here (after version claim) so closeTable cannot
 * double-pay stacks + squid_json.pot in the same window.
 */
async function settleSquidShowdown(
  tableId: string,
  state: EngineState,
  table: TableRow,
) {
  if (!table.squid_enabled || table.format === "tournament") return;
  if (state.street !== "showdown" || !state.result) return;
  if (!(await claimSquidColumn(tableId, state.handNo, "squid_hand_no"))) return;
  // bankSquidAnte runs first; if it lost a race, fold unbanked ante into the award.
  let squid = await readSquid(tableId, Number(table.squid_target || 3));
  const anteRows = await sql<{ squid_ante_hand_no: number }>(
    `select squid_ante_hand_no from table_runtime where table_id = $1`,
    [tableId],
  );
  const anteBanked = Number(anteRows[0]?.squid_ante_hand_no || 0) === state.handNo;
  if (!anteBanked && state.squidCollected > 0) {
    squid = { ...squid, pot: squid.pot + state.squidCollected };
  }
  squid = awardSquid(state, squid, true);
  await writeSquid(tableId, squid);
  // Keep showdown state_json stacks in sync with the paid pot (open tables only).
  await sql(
    `update table_runtime r
     set state_json = $2, updated_at = now()
     from cash_tables t
     where r.table_id = $1
       and t.id = r.table_id
       and t.status = 'open'`,
    [tableId, JSON.stringify(state)],
  );
}

async function readRuntime(tableId: string) {
  await ensureRuntime(tableId);
  const [row] = await sql<{
    hand_no: number;
    button_seat: number;
    version: number;
    phase: string;
    state_json: string;
  }>("select hand_no, button_seat, version, phase, state_json from table_runtime where table_id = $1", [
    tableId,
  ]);
  const state =
    row.state_json && row.state_json !== "{}"
      ? (JSON.parse(row.state_json) as EngineState)
      : null;
  return { ...row, state };
}

async function writeRuntime(
  tableId: string,
  patch: {
    handNo?: number;
    button?: number;
    phase: string;
    state: EngineState | null;
    version: number;
  },
): Promise<boolean> {
  const expected = patch.version - 1;
  const rows = await sql(
    `update table_runtime r
     set hand_no = coalesce($2, hand_no),
         button_seat = coalesce($3, button_seat),
         phase = $4,
         state_json = $5,
         version = $6,
         updated_at = now()
     from cash_tables t
     where r.table_id = $1
       and t.id = r.table_id
       and t.status = 'open'
       and r.version = $7
     returning r.version`,
    [
      tableId,
      patch.handNo ?? null,
      patch.button ?? null,
      patch.phase,
      JSON.stringify(patch.state ?? {}),
      patch.version,
      expected,
    ],
  );
  return rows.length > 0;
}

async function syncStacksFromState(tableId: string, state: EngineState) {
  for (const s of state.seats) {
    await sql(
      `update table_seats set stack = $1 where table_id = $2 and seat_no = $3`,
      [s.stack, tableId, s.seat],
    );
  }
}

async function claimHandEconomy(tableId: string, handNo: number): Promise<boolean> {
  await ensureRuntime(tableId);
  const claimed = await sql(
    `update table_runtime
     set economy_hand_no = $2
     where table_id = $1
       and hand_no = $2
       and economy_hand_no <> $2
     returning table_id`,
    [tableId, handNo],
  );
  return claimed.length > 0;
}

async function applyHandEconomy(tableId: string, state: EngineState) {
  if (!state.result) return;
  // Only one poller may settle rake/BBJP for a given hand.
  if (!(await claimHandEconomy(tableId, state.handNo))) return;
  const rake = state.result.rake || 0;
  const bbjpFee = state.result.bbjpFee || 0;
  if (rake > 0) {
    await sql(
      `update club_rake set total_rake = total_rake + $1, updated_at = now() where club_id = $2`,
      [rake, DEFAULT_CLUB_ID],
    );
  }
  if (bbjpFee > 0) {
    const hand = await bumpBbjpCollections(bbjpFee);
    await sql(
      `update bbjp_settings
       set balance = balance + $1, trigger_hand = $2, updated_at = now()
       where club_id = $3`,
      [bbjpFee, hand, DEFAULT_CLUB_ID],
    );
  }
  if (state.result.bbjpHit) {
    const claimed = await sql<{ pool: string }>(
      `with old as (
         select club_id, balance as pool
         from bbjp_settings
         where club_id = $1 and enabled = true and balance > 0
       )
       update bbjp_settings b
       set balance = 0, updated_at = now()
       from old
       where b.club_id = old.club_id and b.balance = old.pool
       returning old.pool`,
      [DEFAULT_CLUB_ID],
    );
    const pool = num(claimed[0]?.pool ?? 0);
    if (pool > 0) {
      const hit = state.result.bbjpHit;
      const loserPay = Math.floor(pool * hit.loserShare * 100) / 100;
      const winnerPay = Math.floor(pool * hit.winnerShare * 100) / 100;
      const othersPool = Math.max(0, pool - loserPay - winnerPay);
      const loser = state.seats.find((s) => s.seat === hit.loserSeat)!;
      const winner = state.seats.find((s) => s.seat === hit.winnerSeat)!;
      loser.stack += loserPay;
      winner.stack += winnerPay;
      const others = hit.others
        .map((seat) => state.seats.find((s) => s.seat === seat))
        .filter(Boolean);
      if (others.length) {
        const each = Math.floor((othersPool / others.length) * 100) / 100;
        let paid = 0;
        others.forEach((o, i) => {
          const amt =
            i === others.length - 1
              ? Math.round((othersPool - paid) * 100) / 100
              : each;
          paid += amt;
          o!.stack += amt;
        });
      }
      // Award starts a new jackpot collections cycle (ladder → AAAKK).
      await resetBbjpCollectionsCycle();
      state.log.push(
        `BBJP paid ${loserPay} to ${loser.name}, ${winnerPay} to ${winner.name} · ladder reset`,
      );
    }
  }
  await syncStacksFromState(tableId, state);
}

function maskMemberId(
  memberId: string | null | undefined,
  viewerMemberId: string | null,
) {
  if (!memberId) return null;
  if (viewerMemberId && memberId === viewerMemberId) return memberId;
  return null;
}

function maskState(state: EngineState | null, viewerMemberId: string | null) {
  if (!state) return null;
  return {
    handNo: state.handNo,
    street: state.street,
    board: serializeCards(state.board),
    button: state.button,
    sb: state.sb,
    bb: state.bb,
    toAct: state.toAct,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    pot: publicPot(state),
    pots: state.pots,
    log: state.log.slice(-12),
    result: state.result,
    seats: state.seats.map((s) => {
      const isSelf = Boolean(viewerMemberId && s.memberId === viewerMemberId);
      const showdownShow =
        state.street === "showdown" &&
        !s.folded &&
        s.hole.length > 0 &&
        Boolean(state.result);
      const show = isSelf || showdownShow;
      return {
        seat: s.seat,
        memberId: maskMemberId(s.memberId, viewerMemberId),
        name: s.name,
        stack: s.stack,
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        sittingOut: s.sittingOut,
        isBot: s.isBot,
        hole: show
          ? serializeCards(s.hole)
          : s.hole.length
            ? Array.from({ length: s.hole.length }, () => "xx")
            : [],
      };
    }),
  };
}

export async function getTableView(
  tableId: string,
  viewerMemberId: string | null,
  opts: { advance?: boolean } = {},
) {
  await ensureClubSeeded();
  let tournament = await getTournamentByTable(tableId);
  const finished = tournament?.status === "finished";
  const table = await getTable(tableId, finished);
  await ensureRuntime(tableId);
  let seats = await getSeats(tableId);
  const viewerSeatedEarly = Boolean(
    viewerMemberId && seats.some((s) => s.member_id === viewerMemberId),
  );
  if (table.is_private && !opts.advance && !viewerSeatedEarly && !viewerMemberId) {
    throw new Error("Private table — join the club first");
  }
  if (seats.length !== table.seats) {
    for (let i = 0; i < table.seats; i++) {
      await sql(
        `insert into table_seats (table_id, seat_no, display_name, stack, is_bot, sitting_out)
         values ($1,$2,'',0,false,false)
         on conflict (table_id, seat_no) do nothing`,
        [tableId, i],
      );
    }
    seats = await getSeats(tableId);
  }
  let runtime = await readRuntime(tableId);
  const viewerSeated = Boolean(
    viewerMemberId && seats.some((s) => s.member_id === viewerMemberId),
  );
  // Only seated players (or explicit admin advance) may drive bots / next hand / MTT finish.
  const canAdvance = Boolean(opts.advance) || viewerSeated;

  if (canAdvance && table.status === "open" && tournament?.status === "running") {
    tournament = (await maybeAdvanceTournamentBlinds(tableId)) ?? tournament;
  }

  // auto-run bot actions
  if (
    canAdvance &&
    runtime.state &&
    runtime.state.toAct != null &&
    table.status === "open"
  ) {
    runtime = await maybeRunBots(tableId, runtime);
  }

  // auto-start next hand after short showdown pause
  if (canAdvance && table.status === "open") {
    if (
      runtime.state &&
      runtime.state.street === "showdown" &&
      runtime.state.endedAt &&
      Date.now() - runtime.state.endedAt > 3500
    ) {
      await markBustedPlayers(tableId);
      const finishedNow = await maybeFinishTournament(tableId);
      if (!finishedNow) {
        await beginNextHand(tableId);
      }
      runtime = await readRuntime(tableId);
      tournament = (await getTournamentByTable(tableId)) ?? tournament;
    } else if (!runtime.state || runtime.phase === "waiting") {
      const occupied = seats.filter((s) => s.member_id && num(s.stack) > 0);
      if (occupied.length >= 2) {
        await beginNextHand(tableId);
        runtime = await readRuntime(tableId);
      } else if (tournament?.status === "running") {
        await maybeFinishTournament(tableId);
        tournament = (await getTournamentByTable(tableId)) ?? tournament;
        runtime = await readRuntime(tableId);
      }
    }
  }

  const refreshed = await getTable(tableId, true);
  seats = await getSeats(tableId);
  const bbjp = await getBbjp();
  const mySeat = runtime.state?.seats.find((s) => s.memberId === viewerMemberId);
  const legal =
    runtime.state && mySeat && refreshed.status === "open"
      ? legalActions(runtime.state, mySeat.seat)
      : { actions: [], sizing: null };
  const myTableSeat = seats.find((s) => s.member_id === viewerMemberId);
  const gameType = (isGameType(refreshed.game_type)
    ? refreshed.game_type
    : "NLH") as GameType;
  const masked = maskState(runtime.state, viewerMemberId);
  const myLive = masked?.seats.find((s) => s.memberId === viewerMemberId);
  const handStrength =
    myLive && myLive.hole.length && !myLive.hole.includes("xx")
      ? describeMadeHand(myLive.hole, masked?.board ?? [], gameType)
      : null;
  let cosmetics: Awaited<ReturnType<typeof getMemberCosmetics>> | null = null;
  if (viewerMemberId) {
    try {
      cosmetics = await getMemberCosmetics(viewerMemberId);
    } catch {
      cosmetics = null;
    }
  }

  return {
    meMemberId: viewerMemberId,
    meSeat: myTableSeat ? myTableSeat.seat_no : null,
    table: {
      id: refreshed.id,
      title: refreshed.title,
      sb: num(refreshed.sb),
      bb: num(refreshed.bb),
      seats: refreshed.seats,
      buyinMin: num(refreshed.buyin_min),
      buyinMax: num(refreshed.buyin_max),
      rakePercent: num(refreshed.rake_percent),
      rakeCapBb: num(refreshed.rake_cap_bb),
      bbjpEnabled: refreshed.bbjp_enabled,
      format: refreshed.format,
      gameType: refreshed.game_type || "NLH",
      status: refreshed.status,
      squidEnabled: Boolean(refreshed.squid_enabled),
      squidTarget: Number(refreshed.squid_target || 3),
    },
    squid: refreshed.squid_enabled
      ? await readSquid(tableId, Number(refreshed.squid_target || 3))
      : null,
    tournament: tournament
      ? {
          id: tournament.id,
          title: tournament.title,
          status: tournament.status,
          blindLevel: tournament.blind_level ?? 1,
          blindMinutes: tournament.blind_minutes,
          prizePool: num(tournament.prize_pool ?? 0),
          winnerMemberId: tournament.winner_member_id ?? null,
        }
      : null,
    seats: seats.map((s) => ({
      seat: s.seat_no,
      memberId: maskMemberId(s.member_id, viewerMemberId),
      name: s.display_name,
      stack: num(s.stack),
      isBot: s.is_bot,
      sittingOut: s.sitting_out,
      empty: !s.member_id,
    })),
    hand: masked,
    handStrength,
    cosmetics: cosmetics
      ? {
          avatar: cosmetics.equipped_avatar,
          felt: cosmetics.equipped_felt,
          cardBack: cosmetics.equipped_card_back,
        }
      : null,
    actions: legal.actions,
    sizing: legal.sizing,
    phase: runtime.phase,
    version: runtime.version,
    bbjp: {
      balance: num(bbjp.balance),
      enabled: bbjp.enabled,
      trigger: bbjp.minimum_hand ?? bbjp.trigger_hand,
      collections: num(bbjp.cycle_collections ?? 0),
      minimumHand: bbjp.minimum_hand ?? bbjp.trigger_hand,
    },
  };
}

async function maybeRunBots(
  tableId: string,
  runtime: Awaited<ReturnType<typeof readRuntime>>,
) {
  let current = runtime;
  for (let guard = 0; guard < 12; guard++) {
    const state = current.state;
    if (!state || state.toAct == null || state.street === "showdown") break;
    const actor = state.seats.find((s) => s.seat === state.toAct);
    if (!actor?.isBot) break;
    // Natural delay so bots don't snap-act; personality drives timing.
    const expectedVersion = current.version;
    const delay = Math.min(botThinkMs(styleForBot(actor.memberId)), 400);
    await new Promise((r) => setTimeout(r, delay));
    // Another poller may have acted during the delay.
    current = await readRuntime(tableId);
    if (
      current.version !== expectedVersion ||
      !current.state ||
      current.state.toAct !== actor.seat
    ) {
      break;
    }
    const decision = decideBotAction(current.state, actor.seat);
    const next = applyAction(
      current.state,
      actor.seat,
      decision.type,
      decision.amount ?? 0,
    );
    const table = await getTable(tableId, true);
    const version = current.version + 1;
    const wrote = await writeRuntime(tableId, {
      phase: next.street === "showdown" ? "showdown" : "hand",
      state: next,
      version,
      handNo: next.handNo,
      button: next.button,
    });
    if (!wrote) break;
    if (next.street === "showdown") {
      await bankSquidAnte(tableId, next, table);
      await settleSquidShowdown(tableId, next, table);
      await applyHandEconomy(tableId, next);
      await markBustedPlayers(tableId);
    }
    await syncStacksFromState(tableId, next);
    current = await readRuntime(tableId);
  }
  return current;
}

async function beginNextHand(tableId: string) {
  await maybeAdvanceTournamentBlinds(tableId);
  const table = await getTable(tableId);
  const seats = await getSeats(tableId);
  const runtime = await readRuntime(tableId);
  const occupied = seats.filter((s) => s.member_id && num(s.stack) > 0);
  if (occupied.length < 2) {
    await writeRuntime(tableId, {
      phase: "waiting",
      state: null,
      version: runtime.version + 1,
    });
    await maybeFinishTournament(tableId);
    return;
  }

  // Another poller may already have started this hand.
  if (runtime.state && runtime.phase === "hand" && runtime.state.street !== "showdown") {
    return;
  }

  const bbjp = await getBbjp();
  const isTournament = table.format === "tournament";
  const button =
    runtime.hand_no === 0
      ? occupied[0]!.seat_no
      : nextButton(
          occupied.map((s) => ({
            seat: s.seat_no,
            memberId: s.member_id!,
            name: s.display_name,
            stack: num(s.stack),
            bet: 0,
            hole: [],
            folded: false,
            allIn: false,
            sittingOut: false,
            isBot: s.is_bot,
            contributed: 0,
          })),
          runtime.button_seat,
        );

  const handNo = runtime.hand_no + 1;
  const squidEnabled = !isTournament && Boolean(table.squid_enabled);
  const state = startHand(
    seats
      .filter((s) => s.member_id)
      .map((s) => ({
        seat: s.seat_no,
        memberId: s.member_id!,
        name: s.display_name,
        stack: num(s.stack),
        isBot: s.is_bot,
        sittingOut: s.sitting_out || num(s.stack) <= 0,
      })),
    {
      handNo,
      button,
      sb: num(table.sb),
      bb: num(table.bb),
      rakePercent: isTournament ? 0 : num(table.rake_percent),
      rakeCapBb: isTournament ? 0 : num(table.rake_cap_bb),
      bbjpEnabled: !isTournament && Boolean(table.bbjp_enabled) && bbjp.enabled,
      bbjpTrigger: bbjp.trigger_hand,
      gameType: (isGameType(table.game_type) ? table.game_type : "NLH") as GameType,
      squidAnte: squidEnabled ? num(table.bb) : 0,
    },
  );

  const phase =
    state.street === "waiting"
      ? "waiting"
      : state.street === "showdown"
        ? "showdown"
        : "hand";
  const wrote = await writeRuntime(tableId, {
    handNo,
    button,
    phase,
    state,
    version: runtime.version + 1,
  });
  if (!wrote) return;
  if (squidEnabled) {
    await bankSquidAnte(tableId, state, table);
    await settleSquidShowdown(tableId, state, table);
  }
  if (state.street === "showdown") {
    await applyHandEconomy(tableId, state);
    await markBustedPlayers(tableId);
  }
  await syncStacksFromState(tableId, state);
  await maybeRunBots(tableId, await readRuntime(tableId));
}

export async function sitAtTable(
  tableId: string,
  memberId: string,
  seatNo: number,
  buyIn: number,
) {
  await ensureClubSeeded();
  const table = await getTable(tableId);
  if (table.format === "tournament") {
    throw new Error("Tournament seats are assigned at start");
  }
  if (seatNo < 0 || seatNo >= table.seats) throw new Error("Invalid seat");
  if (buyIn < num(table.buyin_min) || buyIn > num(table.buyin_max)) {
    throw new Error(
      `Buy-in must be ${num(table.buyin_min)}–${num(table.buyin_max)}`,
    );
  }
  const runtime = await readRuntime(tableId);
  if (runtime.state && runtime.state.street !== "waiting" && runtime.state.street !== "showdown") {
    // allow sit between hands only for simplicity when waiting/showdown; during hand ok if empty seat
  }
  const seats = await getSeats(tableId);
  if (!seats.length) {
    for (let i = 0; i < table.seats; i++) {
      await sql(
        `insert into table_seats (table_id, seat_no, display_name, stack, is_bot, sitting_out)
         values ($1,$2,'',0,false,false) on conflict (table_id, seat_no) do nothing`,
        [tableId, i],
      );
    }
  }
  const already = await sql<SeatRow>(
    `select * from table_seats where table_id = $1 and member_id = $2`,
    [tableId, memberId],
  );
  if (already.length) throw new Error("Already seated");

  const [member] = await sql<{ display_name: string; chip_balance: string }>(
    `select display_name, chip_balance from members where id = $1`,
    [memberId],
  );
  if (!member) throw new Error("Player not found");
  if (num(member.chip_balance) < buyIn) throw new Error("Not enough club chips");

  // Claim the empty seat first so two sitters cannot overwrite each other.
  const claimed = await sql<SeatRow>(
    `update table_seats
     set member_id = $3,
         display_name = $4,
         stack = 0,
         is_bot = false,
         sitting_out = false
     where table_id = $1 and seat_no = $2 and member_id is null
     returning *`,
    [tableId, seatNo, memberId, member.display_name],
  );
  if (!claimed.length) throw new Error("Seat taken");

  try {
    await sendChips(memberId, -buyIn, `table_buyin:${tableId}`);
    await sql(
      `update table_seats set stack = $3 where table_id = $1 and seat_no = $2 and member_id = $4`,
      [tableId, seatNo, buyIn, memberId],
    );
  } catch (error) {
    await sql(
      `update table_seats
       set member_id = null, display_name = '', stack = 0, is_bot = false, sitting_out = false
       where table_id = $1 and seat_no = $2 and member_id = $3`,
      [tableId, seatNo, memberId],
    );
    throw error;
  }

  return getTableView(tableId, memberId);
}

export async function leaveTable(tableId: string, memberId: string) {
  const runtime = await readRuntime(tableId);
  if (runtime.state && !["waiting", "showdown"].includes(runtime.state.street)) {
    throw new Error("Wait for the hand to finish");
  }
  const table = await getTable(tableId);
  // Capture pre-clear stack/is_bot — RETURNING * after SET would always be 0/false.
  const claimed = await sql<{
    stack: string | number;
    is_bot: boolean;
    seat_no: number;
  }>(
    `with old as (
       select table_id, seat_no, member_id, stack, is_bot
       from table_seats
       where table_id = $1 and member_id = $2
     ),
     upd as (
       update table_seats t
       set member_id = null, display_name = '', stack = 0, is_bot = false, sitting_out = false
       from old
       where t.table_id = old.table_id
         and t.seat_no = old.seat_no
         and t.member_id = old.member_id
       returning t.seat_no
     )
     select old.stack, old.is_bot, old.seat_no
     from old
     join upd on upd.seat_no = old.seat_no`,
    [tableId, memberId],
  );
  if (!claimed.length) throw new Error("Not seated");
  const seat = claimed[0]!;
  const stack = num(seat.stack);
  const wasBot = seat.is_bot;
  const isTournament = table.format === "tournament";
  // Tournament chips are not club chips — leaving forfeits the stack.
  if (!isTournament && !wasBot && stack > 0) {
    await sendChips(memberId, stack, `table_cashout:${tableId}`);
  }
  // Bot stacks return to the club AI float — never cash out to a player.
  if (!isTournament && wasBot && stack > 0) {
    await creditBotFloat(stack, `bot_cashout:${tableId}`);
  }
  if (isTournament) {
    await maybeFinishTournament(tableId);
  }
  return getTableView(tableId, wasBot ? null : memberId, { advance: true });
}

export async function addBot(tableId: string, seatNo?: number) {
  const table = await getTable(tableId);
  if (table.format === "tournament") {
    throw new Error("Cannot add bots to a running tournament");
  }
  await ensureRuntime(tableId);
  const seats = await getSeats(tableId);
  if (!seats.length) {
    for (let i = 0; i < table.seats; i++) {
      await sql(
        `insert into table_seats (table_id, seat_no, display_name, stack, is_bot, sitting_out)
         values ($1,$2,'',0,false,false) on conflict (table_id, seat_no) do nothing`,
        [tableId, i],
      );
    }
  }
  const open = (await getSeats(tableId)).filter((s) => !s.member_id);
  if (!open.length) throw new Error("No empty seats");
  const seat = seatNo != null ? open.find((s) => s.seat_no === seatNo) : open[0];
  if (!seat) throw new Error("Seat not free");
  const buyIn = num(table.buyin_min);
  // Fund AI stacks from the club bot float so wins cannot mint unbacked chips.
  await debitBotFloat(buyIn, `bot_buyin:${tableId}`);
  const botId = id("bot");
  const botName = `AI ${seat.seat_no + 1}`;
  try {
    await sql(
      `insert into members (id, club_id, display_name, role, chip_balance)
       values ($1, $2, $3, 'bot', 0)`,
      [botId, DEFAULT_CLUB_ID, botName],
    );
    const claimed = await sql(
      `update table_seats
       set member_id = $1, display_name = $2, stack = $3, is_bot = true, sitting_out = false
       where table_id = $4 and seat_no = $5 and member_id is null
       returning seat_no`,
      [botId, botName, buyIn, tableId, seat.seat_no],
    );
    if (!claimed.length) {
      await sql(`delete from members where id = $1`, [botId]);
      throw new Error("Seat not free");
    }
  } catch (error) {
    await creditBotFloat(buyIn, `bot_buyin_refund:${tableId}`);
    throw error;
  }
  return getTableView(tableId, null, { advance: true });
}

export async function playerAction(
  tableId: string,
  memberId: string,
  type: ActionType,
  amount = 0,
) {
  const runtime = await readRuntime(tableId);
  if (!runtime.state) throw new Error("No hand in progress");
  const seat = runtime.state.seats.find((s) => s.memberId === memberId);
  if (!seat) throw new Error("Not at this table");
  if (runtime.state.toAct !== seat.seat) throw new Error("Not your turn");
  if (
    isAllInOrFold(runtime.state.gameType) &&
    type !== "fold" &&
    type !== "allin"
  ) {
    throw new Error("All-in or Fold: only fold or all-in");
  }

  let next = applyAction(runtime.state, seat.seat, type, amount);
  const table = await getTable(tableId, true);
  const wrote = await writeRuntime(tableId, {
    phase: next.street === "showdown" ? "showdown" : "hand",
    state: next,
    version: runtime.version + 1,
    handNo: next.handNo,
    button: next.button,
  });
  if (!wrote) throw new Error("Table updated — try again");
  if (next.street === "showdown") {
    await bankSquidAnte(tableId, next, table);
    await settleSquidShowdown(tableId, next, table);
    await applyHandEconomy(tableId, next);
    await markBustedPlayers(tableId);
  }
  await syncStacksFromState(tableId, next);
  await maybeRunBots(tableId, await readRuntime(tableId));
  return getTableView(tableId, memberId);
}

export type LegalAction = {
  type: ActionType;
  label: string;
  amount?: number;
};

export type SizingInfo = {
  kind: "bet" | "raise";
  min: number;
  max: number;
  presets: number[];
};

export function legalActions(state: EngineState, seatNo: number): {
  actions: LegalAction[];
  sizing: SizingInfo | null;
} {
  const seat = state.seats.find((s) => s.seat === seatNo);
  if (!seat || state.toAct !== seatNo) return { actions: [], sizing: null };
  const toCall = Math.max(0, state.currentBet - seat.bet);

  if (isAllInOrFold(state.gameType)) {
    const stackMax = seat.bet + seat.stack;
    return {
      actions: [
        { type: "fold", label: "Fold" },
        { type: "allin", label: `All-in ${stackMax}`, amount: stackMax },
      ],
      sizing: null,
    };
  }

  const actions: LegalAction[] = [{ type: "fold", label: "Fold" }];
  if (toCall === 0) actions.push({ type: "check", label: "Check" });
  else {
    actions.push({
      type: "call",
      label: toCall >= seat.stack ? `All-in ${seat.stack}` : `Call ${toCall}`,
      amount: Math.min(toCall, seat.stack),
    });
  }

  let sizing: SizingInfo | null = null;
  const stackMax = seat.bet + seat.stack;
  const maxTo = isPotLimit(state.gameType)
    ? Math.min(stackMax, potLimitMaxTo(state, seatNo))
    : stackMax;
  if (seat.stack > toCall) {
    if (state.currentBet === 0) {
      const min = Math.min(maxTo, seat.bet + state.bb);
      if (min <= maxTo) {
        sizing = {
          kind: "bet",
          min,
          max: maxTo,
          presets: uniquePresets(min, maxTo, state.bb, publicPot(state)),
        };
        actions.push({ type: "bet", label: `Bet ${min}`, amount: min });
      }
    } else {
      const minTo = state.currentBet + state.minRaise;
      if (minTo <= maxTo) {
        sizing = {
          kind: "raise",
          min: minTo,
          max: maxTo,
          presets: uniquePresets(minTo, maxTo, state.bb, publicPot(state)),
        };
        actions.push({ type: "raise", label: `Raise to ${minTo}`, amount: minTo });
      }
    }
    // All-in always allowed for remaining stack (may exceed pot-limit).
    actions.push({ type: "allin", label: `All-in ${stackMax}`, amount: stackMax });
  }
  return { actions, sizing };
}

function uniquePresets(min: number, max: number, bb: number, pot: number) {
  const candidates = [
    min,
    Math.round(pot * 0.5),
    Math.round(pot * 0.75),
    pot,
    Math.round(pot * 1.5),
    min + bb * 2,
    min + bb * 4,
    max,
  ]
    .map((n) => Math.max(min, Math.min(max, Math.round(n))))
    .filter((n) => n >= min && n <= max);
  return [...new Set(candidates)].sort((a, b) => a - b).slice(0, 6);
}

void cardId;
