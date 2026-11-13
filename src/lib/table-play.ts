import { sql } from "./db";
import { id } from "./ids";
import { DEFAULT_CLUB_ID, ensureClubSeeded, getBbjp, num, sendChips } from "./club";
import {
  applyAction,
  botDecision,
  nextButton,
  publicPot,
  serializeCards,
  startHand,
  type ActionType,
  type EngineState,
} from "./poker/engine";
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
  status: string;
  format: string;
};

async function ensureRuntime(tableId: string) {
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
) {
  await sql(
    `update table_runtime
     set hand_no = coalesce($2, hand_no),
         button_seat = coalesce($3, button_seat),
         phase = $4,
         state_json = $5,
         version = $6,
         updated_at = now()
     where table_id = $1`,
    [
      tableId,
      patch.handNo ?? null,
      patch.button ?? null,
      patch.phase,
      JSON.stringify(patch.state ?? {}),
      patch.version,
    ],
  );
}

async function syncStacksFromState(tableId: string, state: EngineState) {
  for (const s of state.seats) {
    await sql(
      `update table_seats set stack = $1 where table_id = $2 and seat_no = $3`,
      [s.stack, tableId, s.seat],
    );
  }
}

async function applyHandEconomy(tableId: string, state: EngineState) {
  if (!state.result) return;
  const rake = state.result.rake || 0;
  const bbjpFee = state.result.bbjpFee || 0;
  if (rake > 0) {
    await sql(
      `update club_rake set total_rake = total_rake + $1, updated_at = now() where club_id = $2`,
      [rake, DEFAULT_CLUB_ID],
    );
  }
  if (bbjpFee > 0) {
    await sql(
      `update bbjp_settings set balance = balance + $1, updated_at = now() where club_id = $2`,
      [bbjpFee, DEFAULT_CLUB_ID],
    );
  }
  if (state.result.bbjpHit) {
    const bbjp = await getBbjp();
    const pool = num(bbjp.balance);
    if (pool > 0 && bbjp.enabled) {
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
      await sql(
        `update bbjp_settings set balance = 0, updated_at = now() where club_id = $1`,
        [DEFAULT_CLUB_ID],
      );
      state.log.push(
        `BBJP paid ${loserPay} to ${loser.name}, ${winnerPay} to ${winner.name}`,
      );
    }
  }
  await syncStacksFromState(tableId, state);
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
      const show =
        state.street === "showdown" ||
        (viewerMemberId && s.memberId === viewerMemberId);
      return {
        seat: s.seat,
        memberId: s.memberId,
        name: s.name,
        stack: s.stack,
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        sittingOut: s.sittingOut,
        isBot: s.isBot,
        hole: show ? serializeCards(s.hole) : s.hole.length ? ["xx", "xx"] : [],
      };
    }),
  };
}

export async function getTableView(tableId: string, viewerMemberId: string | null) {
  await ensureClubSeeded();
  let tournament = await getTournamentByTable(tableId);
  const finished = tournament?.status === "finished";
  const table = await getTable(tableId, finished);
  await ensureRuntime(tableId);
  let seats = await getSeats(tableId);
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

  if (table.status === "open" && tournament?.status === "running") {
    tournament = (await maybeAdvanceTournamentBlinds(tableId)) ?? tournament;
  }

  // auto-run bot actions
  if (runtime.state && runtime.state.toAct != null && table.status === "open") {
    runtime = await maybeRunBots(tableId, runtime);
  }

  // auto-start next hand after short showdown pause
  if (table.status === "open") {
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
      status: refreshed.status,
    },
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
      memberId: s.member_id,
      name: s.display_name,
      stack: num(s.stack),
      isBot: s.is_bot,
      sittingOut: s.sitting_out,
      empty: !s.member_id,
    })),
    hand: maskState(runtime.state, viewerMemberId),
    actions: legal.actions,
    sizing: legal.sizing,
    phase: runtime.phase,
    version: runtime.version,
    bbjp: {
      balance: num(bbjp.balance),
      enabled: bbjp.enabled,
      trigger: bbjp.trigger_hand,
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
    const decision = botDecision(state, actor.seat);
    const next = applyAction(state, actor.seat, decision.type, decision.amount ?? 0);
    if (next.street === "showdown") {
      await applyHandEconomy(tableId, next);
      await markBustedPlayers(tableId);
    }
    const version = current.version + 1;
    await writeRuntime(tableId, {
      phase: next.street === "showdown" ? "showdown" : "hand",
      state: next,
      version,
      handNo: next.handNo,
      button: next.button,
    });
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
    },
  );

  await writeRuntime(tableId, {
    handNo,
    button,
    phase: state.street === "waiting" ? "waiting" : "hand",
    state,
    version: runtime.version + 1,
  });
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
  const [target] = await sql<SeatRow>(
    `select * from table_seats where table_id = $1 and seat_no = $2`,
    [tableId, seatNo],
  );
  if (target?.member_id) throw new Error("Seat taken");

  const [member] = await sql<{ display_name: string; chip_balance: string }>(
    `select display_name, chip_balance from members where id = $1`,
    [memberId],
  );
  if (!member) throw new Error("Player not found");
  if (num(member.chip_balance) < buyIn) throw new Error("Not enough club chips");

  await sendChips(memberId, -buyIn, `table_buyin:${tableId}`);
  await sql(
    `insert into table_seats (table_id, seat_no, member_id, display_name, stack, is_bot, sitting_out)
     values ($1,$2,$3,$4,$5,false,false)
     on conflict (table_id, seat_no) do update
     set member_id = excluded.member_id,
         display_name = excluded.display_name,
         stack = excluded.stack,
         is_bot = false,
         sitting_out = false`,
    [tableId, seatNo, memberId, member.display_name, buyIn],
  );

  // start if enough players
  const view = await getTableView(tableId, memberId);
  return view;
}

export async function leaveTable(tableId: string, memberId: string) {
  const runtime = await readRuntime(tableId);
  if (runtime.state && !["waiting", "showdown"].includes(runtime.state.street)) {
    throw new Error("Wait for the hand to finish");
  }
  const table = await getTable(tableId);
  const [seat] = await sql<SeatRow>(
    `select * from table_seats where table_id = $1 and member_id = $2`,
    [tableId, memberId],
  );
  if (!seat) throw new Error("Not seated");
  const stack = num(seat.stack);
  const wasBot = seat.is_bot;
  const isTournament = table.format === "tournament";
  await sql(
    `update table_seats
     set member_id = null, display_name = '', stack = 0, is_bot = false, sitting_out = false
     where table_id = $1 and seat_no = $2`,
    [tableId, seat.seat_no],
  );
  // Tournament chips are not club chips — leaving forfeits the stack.
  if (!isTournament && !wasBot && stack > 0) {
    await sendChips(memberId, stack, `table_cashout:${tableId}`);
  }
  if (isTournament) {
    await maybeFinishTournament(tableId);
  }
  return getTableView(tableId, wasBot ? null : memberId);
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
  const botId = id("bot");
  const botName = `AI ${seat.seat_no + 1}`;
  await sql(
    `insert into members (id, club_id, display_name, role, chip_balance)
     values ($1, $2, $3, 'bot', 0)`,
    [botId, DEFAULT_CLUB_ID, botName],
  );
  await sql(
    `update table_seats
     set member_id = $1, display_name = $2, stack = $3, is_bot = true, sitting_out = false
     where table_id = $4 and seat_no = $5`,
    [botId, botName, buyIn, tableId, seat.seat_no],
  );
  return getTableView(tableId, null);
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

  let next = applyAction(runtime.state, seat.seat, type, amount);
  if (next.street === "showdown") {
    await applyHandEconomy(tableId, next);
    await markBustedPlayers(tableId);
  }
  await writeRuntime(tableId, {
    phase: next.street === "showdown" ? "showdown" : "hand",
    state: next,
    version: runtime.version + 1,
    handNo: next.handNo,
    button: next.button,
  });
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
  const maxTo = seat.bet + seat.stack;
  if (seat.stack > toCall) {
    if (state.currentBet === 0) {
      const min = Math.min(maxTo, seat.bet + state.bb);
      sizing = {
        kind: "bet",
        min,
        max: maxTo,
        presets: uniquePresets(min, maxTo, state.bb, publicPot(state)),
      };
      actions.push({ type: "bet", label: `Bet ${min}`, amount: min });
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
    actions.push({ type: "allin", label: `All-in ${maxTo}`, amount: maxTo });
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
