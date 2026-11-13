import { Card, cardId, freshDeck, shortDeck, shuffle } from "./cards";
import {
  bestHand,
  bestOmahaLow,
  cmpHands,
  cmpLowScore,
  handName,
  meetsBbjpTrigger,
  qualifiesBbjpHoleUse,
  type HandScore,
} from "./eval";
import {
  holeCardCount,
  isAllInOrFold,
  isBombPot,
  isHiLo,
  isPotLimit,
  type GameType,
} from "./variants";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown" | "waiting";

export type EngineSeat = {
  seat: number;
  memberId: string;
  name: string;
  stack: number;
  bet: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  isBot: boolean;
  contributed: number;
};

export type SidePot = { amount: number; eligible: number[] };

export type HandResult = {
  winners: Array<{ seat: number; amount: number; hand?: string }>;
  rake: number;
  bbjpFee: number;
  bbjpHit?: {
    loserSeat: number;
    winnerSeat: number;
    loserShare: number;
    winnerShare: number;
    othersShare: number;
    others: number[];
  };
};

export type EngineState = {
  handNo: number;
  street: Street;
  deck: Card[];
  board: Card[];
  seats: EngineSeat[];
  button: number;
  sb: number;
  bb: number;
  toAct: number | null;
  currentBet: number;
  minRaise: number;
  pots: SidePot[];
  streetCommitted: number;
  acted: number[];
  lastAggressor: number | null;
  result: HandResult | null;
  log: string[];
  rakePercent: number;
  rakeCapBb: number;
  bbjpEnabled: boolean;
  bbjpTrigger: string;
  dealtIn: number[];
  endedAt: number | null;
  gameType: GameType;
};

function alive(s: EngineSeat) {
  return !s.sittingOut && (s.stack > 0 || s.bet > 0 || s.contributed > 0);
}

function inHand(s: EngineSeat) {
  return !s.folded && !s.sittingOut && (s.hole.length > 0 || s.stack > 0);
}

function contenders(state: EngineState) {
  return state.seats.filter((s) => !s.folded && !s.sittingOut && s.hole.length);
}

function canAct(s: EngineSeat) {
  return !s.folded && !s.allIn && !s.sittingOut && s.hole.length > 0 && s.stack > 0;
}

function nextSeat(state: EngineState, from: number, pred: (s: EngineSeat) => boolean) {
  const ordered = [...state.seats].sort((a, b) => a.seat - b.seat);
  if (!ordered.length) return null;
  const at = ordered.findIndex((s) => s.seat === from);
  const start = at >= 0 ? (at + 1) % ordered.length : ordered.findIndex((s) => s.seat > from);
  const fromIdx = start >= 0 ? start : 0;
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[(fromIdx + i) % ordered.length]!;
    if (pred(s)) return s.seat;
  }
  return null;
}

function pushLog(state: EngineState, msg: string) {
  state.log = [...state.log.slice(-40), msg];
}

function takeFromStack(seat: EngineSeat, amount: number): number {
  const pay = Math.min(seat.stack, amount);
  seat.stack -= pay;
  seat.bet += pay;
  seat.contributed += pay;
  if (seat.stack <= 0) {
    seat.stack = 0;
    seat.allIn = true;
  }
  return pay;
}

function buildPots(state: EngineState): SidePot[] {
  const levels = [
    ...new Set(
      state.seats.filter((s) => s.contributed > 0).map((s) => s.contributed),
    ),
  ].sort((a, b) => a - b);
  const pots: SidePot[] = [];
  let prev = 0;
  for (const level of levels) {
    const eligible = state.seats
      .filter((s) => s.contributed >= level && !s.folded)
      .map((s) => s.seat);
    const contributors = state.seats.filter((s) => s.contributed >= level);
    const amount = (level - prev) * contributors.length;
    if (amount > 0 && eligible.length) pots.push({ amount, eligible });
    prev = level;
  }
  if (!pots.length) {
    const total = state.seats.reduce((a, s) => a + s.contributed, 0);
    if (total > 0) {
      pots.push({
        amount: total,
        eligible: contenders(state).map((s) => s.seat),
      });
    }
  }
  return pots;
}

function totalPot(state: EngineState) {
  return (
    state.seats.reduce((a, s) => a + s.contributed, 0) ||
    state.pots.reduce((a, p) => a + p.amount, 0)
  );
}

export function publicPot(state: EngineState) {
  const streetBets = state.seats.reduce((a, s) => a + s.bet, 0);
  return state.pots.reduce((a, p) => a + p.amount, 0) + streetBets;
}

function collectBets(state: EngineState) {
  // bets already in contributed; clear street bets into pots snapshot
  state.pots = buildPots(state);
  for (const s of state.seats) s.bet = 0;
  state.currentBet = 0;
  state.streetCommitted = 0;
  state.acted = [];
  state.lastAggressor = null;
}

function dealBoard(state: EngineState, n: number) {
  if (n === 3) state.deck.pop(); // burn
  if (n === 1) state.deck.pop();
  for (let i = 0; i < n; i++) state.board.push(state.deck.pop()!);
}

function everyoneMatched(state: EngineState) {
  const active = state.seats.filter(canAct);
  if (!active.length) return true;
  return active.every(
    (s) => s.bet === state.currentBet && state.acted.includes(s.seat),
  );
}

function onlyOneContender(state: EngineState) {
  return contenders(state).length <= 1;
}

function advanceStreet(state: EngineState) {
  collectBets(state);
  if (onlyOneContender(state)) {
    finishUncontested(state);
    return;
  }
  const actorsLeft = state.seats.filter(canAct);
  if (state.street === "preflop") {
    state.street = "flop";
    dealBoard(state, 3);
  } else if (state.street === "flop") {
    state.street = "turn";
    dealBoard(state, 1);
  } else if (state.street === "turn") {
    state.street = "river";
    dealBoard(state, 1);
  } else if (state.street === "river") {
    showdown(state);
    return;
  }
  state.minRaise = state.bb;
  if (!actorsLeft.length) {
    // run out board
    while (state.street !== "river" && state.street !== "showdown") {
      if (state.street === "flop") {
        /* already on flop */
      }
      if (state.board.length === 0) {
        state.street = "flop";
        dealBoard(state, 3);
      } else if (state.board.length === 3) {
        state.street = "turn";
        dealBoard(state, 1);
      } else if (state.board.length === 4) {
        state.street = "river";
        dealBoard(state, 1);
      } else break;
    }
    showdown(state);
    return;
  }
  const first = nextSeat(state, state.button, canAct);
  state.toAct = first;
  state.acted = [];
  pushLog(state, `${state.street.toUpperCase()} ${state.board.map(cardId).join(" ")}`);
}

function finishUncontested(state: EngineState) {
  const winner = contenders(state)[0];
  if (!winner) {
    state.street = "waiting";
    state.toAct = null;
    return;
  }
  collectBets(state);
  const pot = state.pots.reduce((a, p) => a + p.amount, 0);
  const { net, rake, bbjpFee } = takeFees(state, pot);
  winner.stack += net;
  state.result = {
    winners: [{ seat: winner.seat, amount: net }],
    rake,
    bbjpFee,
  };
  state.street = "showdown";
  state.toAct = null;
  state.endedAt = Date.now();
  pushLog(state, `${winner.name} wins ${net} uncontested`);
}

function takeFees(state: EngineState, pot: number) {
  let remaining = pot;
  let bbjpFee = 0;
  if (state.bbjpEnabled && pot >= state.bb * 10) {
    bbjpFee = Math.min(remaining, Math.round(state.bb * 0.5 * 100) / 100);
    remaining -= bbjpFee;
  }
  const cap = state.rakeCapBb * state.bb;
  const rake = Math.min(
    remaining,
    Math.min(cap, Math.floor(remaining * (state.rakePercent / 100) * 100) / 100),
  );
  remaining -= rake;
  return { net: Math.max(0, remaining), rake, bbjpFee };
}

function payWinners(
  potWinners: Array<{ seat: EngineSeat; score: HandScore; label: string }>,
  net: number,
  winnersOut: HandResult["winners"],
) {
  if (!potWinners.length || net <= 0) return;
  const share = Math.floor((net / potWinners.length) * 100) / 100;
  let paid = 0;
  potWinners.forEach((w, i) => {
    const amount =
      i === potWinners.length - 1 ? Math.round((net - paid) * 100) / 100 : share;
    paid += amount;
    w.seat.stack += amount;
    winnersOut.push({
      seat: w.seat.seat,
      amount,
      hand: w.label,
    });
  });
}

function showdown(state: EngineState) {
  collectBets(state);
  state.street = "showdown";
  state.toAct = null;
  const evaluated = contenders(state).map((s) => {
    const best = bestHand(s.hole, state.board, state.gameType);
    const low = isHiLo(state.gameType)
      ? bestOmahaLow(s.hole, state.board)
      : { score: null as HandScore | null, cards: [] as typeof s.hole };
    return { seat: s, ...best, lowScore: low.score };
  });
  evaluated.sort((a, b) => cmpHands(b.score, a.score, state.gameType));

  const winnersOut: HandResult["winners"] = [];
  let totalRake = 0;
  let totalBbjpFee = 0;

  for (const pot of state.pots) {
    const eligible = evaluated.filter((e) => pot.eligible.includes(e.seat.seat));
    if (!eligible.length) continue;
    let best: HandScore | null = null;
    for (const e of eligible) {
      if (!best || cmpHands(e.score, best, state.gameType) > 0) best = e.score;
    }
    const highWinners = eligible.filter(
      (e) => cmpHands(e.score, best!, state.gameType) === 0,
    );
    const { net, rake, bbjpFee } = takeFees(state, pot.amount);
    totalRake += rake;
    totalBbjpFee += bbjpFee;

    if (isHiLo(state.gameType)) {
      const lowEligible = eligible.filter((e) => e.lowScore);
      let bestLow: HandScore | null = null;
      for (const e of lowEligible) {
        if (!bestLow || cmpLowScore(e.lowScore!, bestLow) > 0) {
          bestLow = e.lowScore!;
        }
      }
      const lowWinners = bestLow
        ? lowEligible.filter((e) => cmpLowScore(e.lowScore!, bestLow!) === 0)
        : [];
      if (lowWinners.length) {
        const half = Math.floor((net / 2) * 100) / 100;
        const highHalf = net - half;
        payWinners(
          highWinners.map((w) => ({
            seat: w.seat,
            score: w.score,
            label: `${handName(w.score)} (high)`,
          })),
          highHalf,
          winnersOut,
        );
        payWinners(
          lowWinners.map((w) => ({
            seat: w.seat,
            score: w.lowScore!,
            label: "Low",
          })),
          half,
          winnersOut,
        );
      } else {
        payWinners(
          highWinners.map((w) => ({
            seat: w.seat,
            score: w.score,
            label: `${handName(w.score)} (scoop)`,
          })),
          net,
          winnersOut,
        );
      }
    } else {
      payWinners(
        highWinners.map((w) => ({
          seat: w.seat,
          score: w.score,
          label: handName(w.score),
        })),
        net,
        winnersOut,
      );
    }
  }

  // merge winner lines
  const merged = new Map<number, { seat: number; amount: number; hand?: string }>();
  for (const w of winnersOut) {
    const prev = merged.get(w.seat);
    if (prev) prev.amount += w.amount;
    else merged.set(w.seat, { ...w });
  }

  const result: HandResult = {
    winners: [...merged.values()],
    rake: totalRake,
    bbjpFee: totalBbjpFee,
  };

  // BBJP hit detection
  if (
    state.bbjpEnabled &&
    state.dealtIn.length >= 4 &&
    totalPot(state) >= state.bb * 10 &&
    evaluated.length >= 2
  ) {
    const winner = evaluated[0]!;
    const loser = evaluated[1]!;
    if (
      meetsBbjpTrigger(loser.score, state.bbjpTrigger) &&
      qualifiesBbjpHoleUse(loser.seat.hole, loser.cards, state.gameType) &&
      qualifiesBbjpHoleUse(winner.seat.hole, winner.cards, state.gameType)
    ) {
      // payout amounts applied by table-play using club pool; record shares
      result.bbjpHit = {
        loserSeat: loser.seat.seat,
        winnerSeat: winner.seat.seat,
        loserShare: 0.5,
        winnerShare: 0.25,
        othersShare: 0.25,
        others: state.dealtIn.filter(
          (s) => s !== loser.seat.seat && s !== winner.seat.seat,
        ),
      };
      pushLog(
        state,
        `BBJP trigger: ${loser.seat.name} (${handName(loser.score)}) loses to ${winner.seat.name}`,
      );
    }
  }

  state.result = result;
  state.endedAt = Date.now();
  for (const w of result.winners) {
    const seat = state.seats.find((s) => s.seat === w.seat)!;
    pushLog(state, `${seat.name} wins ${w.amount}${w.hand ? ` (${w.hand})` : ""}`);
  }
}

export function startHand(
  seatsIn: Array<{
    seat: number;
    memberId: string;
    name: string;
    stack: number;
    isBot?: boolean;
    sittingOut?: boolean;
  }>,
  opts: {
    handNo: number;
    button: number;
    sb: number;
    bb: number;
    rakePercent: number;
    rakeCapBb: number;
    bbjpEnabled: boolean;
    bbjpTrigger: string;
    gameType?: GameType;
  },
): EngineState {
  const gameType: GameType = opts.gameType ?? "NLH";
  const seats: EngineSeat[] = seatsIn.map((s) => ({
    seat: s.seat,
    memberId: s.memberId,
    name: s.name,
    stack: s.stack,
    bet: 0,
    hole: [],
    folded: false,
    allIn: false,
    sittingOut: Boolean(s.sittingOut) || s.stack <= 0,
    isBot: Boolean(s.isBot),
    contributed: 0,
  }));

  const state: EngineState = {
    handNo: opts.handNo,
    street: "preflop",
    deck: shuffle(gameType === "SHORT_DECK" ? shortDeck() : freshDeck()),
    board: [],
    seats,
    button: opts.button,
    sb: opts.sb,
    bb: opts.bb,
    toAct: null,
    currentBet: 0,
    minRaise: opts.bb,
    pots: [],
    streetCommitted: 0,
    acted: [],
    lastAggressor: null,
    result: null,
    log: [],
    rakePercent: opts.rakePercent,
    rakeCapBb: opts.rakeCapBb,
    bbjpEnabled: opts.bbjpEnabled,
    bbjpTrigger: opts.bbjpTrigger,
    dealtIn: [],
    endedAt: null,
    gameType,
  };

  const active = seats.filter((s) => !s.sittingOut && s.stack > 0);
  if (active.length < 2) {
    state.street = "waiting";
    return state;
  }

  // deal first so bomb antes still see hole cards
  const holes = holeCardCount(gameType);
  for (let i = 0; i < holes; i++) {
    for (const s of active) {
      s.hole.push(state.deck.pop()!);
    }
  }
  state.dealtIn = active.map((s) => s.seat);

  if (isBombPot(gameType)) {
    // Everyone antes 1 BB; no preflop betting — start on the flop.
    const ante = opts.bb;
    for (const s of active) {
      takeFromStack(s, ante);
    }
    collectBets(state);
    state.street = "flop";
    dealBoard(state, 3);
    state.currentBet = 0;
    state.minRaise = opts.bb;
    state.toAct = nextSeat(state, state.button, canAct);
    state.acted = [];
    pushLog(
      state,
      `Hand #${opts.handNo} · BOMB — ante ${ante}, flop ${state.board.map(cardId).join(" ")}`,
    );
    return state;
  }

  // blinds: heads-up button posts SB
  const isHu = active.length === 2;
  const sbSeat = isHu
    ? state.button
    : nextSeat(state, state.button, (s) => !s.sittingOut && s.stack > 0)!;
  const bbSeat = nextSeat(state, sbSeat, (s) => !s.sittingOut && s.stack > 0)!;

  const sbPlayer = state.seats.find((s) => s.seat === sbSeat)!;
  const bbPlayer = state.seats.find((s) => s.seat === bbSeat)!;
  takeFromStack(sbPlayer, opts.sb);
  takeFromStack(bbPlayer, opts.bb);
  state.currentBet = Math.max(sbPlayer.bet, bbPlayer.bet);
  state.minRaise = opts.bb;

  state.toAct = nextSeat(state, bbSeat, canAct);
  state.acted = [];
  pushLog(
    state,
    `Hand #${opts.handNo} · ${gameType} — SB ${sbPlayer.name}, BB ${bbPlayer.name}`,
  );
  return state;
}

/** Pot-limit: max total bet-to = seat.bet + toCall + (pot including toCall). */
export function potLimitMaxTo(state: EngineState, seatNo: number): number {
  const seat = state.seats.find((s) => s.seat === seatNo);
  if (!seat) return 0;
  const toCall = Math.max(0, state.currentBet - seat.bet);
  const pot = publicPot(state);
  const maxRaiseBy = pot + toCall;
  return Math.min(seat.bet + seat.stack, seat.bet + toCall + maxRaiseBy);
}

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "allin";

export function applyAction(
  state: EngineState,
  seatNo: number,
  type: ActionType,
  amount = 0,
): EngineState {
  if (state.street === "waiting" || state.street === "showdown") {
    throw new Error("No action now");
  }
  if (state.toAct !== seatNo) throw new Error("Not your turn");
  const seat = state.seats.find((s) => s.seat === seatNo);
  if (!seat || !canAct(seat)) throw new Error("Cannot act");
  if (isAllInOrFold(state.gameType) && type !== "fold" && type !== "allin") {
    throw new Error("All-in or Fold: only fold or all-in");
  }

  const toCall = Math.max(0, state.currentBet - seat.bet);

  let reopened = false;

  if (type === "fold") {
    seat.folded = true;
    pushLog(state, `${seat.name} folds`);
  } else if (type === "check") {
    if (toCall > 0) throw new Error("Cannot check");
    pushLog(state, `${seat.name} checks`);
  } else if (type === "call") {
    if (toCall <= 0) throw new Error("Nothing to call");
    takeFromStack(seat, toCall);
    pushLog(state, `${seat.name} calls ${toCall}`);
  } else if (type === "bet" || type === "raise") {
    if (type === "bet" && state.currentBet > 0) throw new Error("Use raise");
    if (type === "raise" && state.currentBet <= 0) throw new Error("Use bet");
    const target = amount;
    const need = target - seat.bet;
    if (need <= 0 || need > seat.stack) throw new Error("Bad bet size");
    if (isPotLimit(state.gameType)) {
      const maxTo = potLimitMaxTo(state, seatNo);
      if (target > maxTo + 1e-9 && need < seat.stack) {
        throw new Error(`Pot-limit max ${maxTo}`);
      }
    }
    const raiseBy = target - state.currentBet;
    if (state.currentBet > 0 && raiseBy < state.minRaise && need < seat.stack) {
      throw new Error(`Min raise ${state.minRaise}`);
    }
    takeFromStack(seat, need);
    if (target > state.currentBet) {
      state.minRaise = Math.max(state.minRaise, target - state.currentBet);
      state.currentBet = target;
      state.lastAggressor = seatNo;
      reopened = true;
    }
    pushLog(state, `${seat.name} ${type}s to ${target}`);
  } else if (type === "allin") {
    takeFromStack(seat, seat.stack);
    if (seat.bet > state.currentBet) {
      state.minRaise = Math.max(state.minRaise, seat.bet - state.currentBet);
      state.currentBet = seat.bet;
      state.lastAggressor = seatNo;
      reopened = true;
    }
    pushLog(state, `${seat.name} all-in ${seat.bet}`);
  } else {
    throw new Error("Unknown action");
  }

  if (reopened) state.acted = [seatNo];
  else if (!state.acted.includes(seatNo)) state.acted.push(seatNo);

  if (onlyOneContender(state)) {
    finishUncontested(state);
    return state;
  }

  if (everyoneMatched(state) || !state.seats.some(canAct)) {
    advanceStreet(state);
    return state;
  }

  state.toAct = nextSeat(state, seatNo, canAct);
  return state;
}

export function botDecision(state: EngineState, seatNo: number): {
  type: ActionType;
  amount?: number;
} {
  const seat = state.seats.find((s) => s.seat === seatNo)!;
  if (isAllInOrFold(state.gameType)) {
    // Short-stack push/fold: shove ~45% randomly when facing a decision.
    return Math.random() < 0.45
      ? { type: "allin" }
      : { type: "fold" };
  }
  const toCall = Math.max(0, state.currentBet - seat.bet);
  if (toCall === 0) return { type: "check" };
  if (toCall <= state.bb * 2 || toCall >= seat.stack) {
    return toCall >= seat.stack ? { type: "allin" } : { type: "call" };
  }
  // fold weak random pressure
  if (toCall > state.bb * 6 && Math.random() < 0.55) return { type: "fold" };
  return toCall >= seat.stack ? { type: "allin" } : { type: "call" };
}

export function serializeCards(cards: Card[]) {
  return cards.map(cardId);
}

export function nextButton(seats: EngineSeat[], button: number) {
  const ordered = [...seats].sort((a, b) => a.seat - b.seat);
  if (!ordered.length) return button;
  const at = ordered.findIndex((s) => s.seat === button);
  const start = at >= 0 ? (at + 1) % ordered.length : ordered.findIndex((s) => s.seat > button);
  const fromIdx = start >= 0 ? start : 0;
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[(fromIdx + i) % ordered.length]!;
    if (!s.sittingOut && s.stack > 0) return s.seat;
  }
  return button;
}
