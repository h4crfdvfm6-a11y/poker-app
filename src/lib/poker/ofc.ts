import { Card, cardId, freshDeck, shuffle } from "./cards";
import {
  cmpScore,
  evaluateFive,
  evaluateThree,
  handName,
  type HandScore,
} from "./eval";

export type OfcRow = "front" | "middle" | "back";

export type OfcSeat = {
  seat: number;
  memberId: string;
  name: string;
  stack: number;
  isBot: boolean;
  front: Card[];
  middle: Card[];
  back: Card[];
  /** Next hand starts in Fantasyland after QQ+ / trips front. */
  fantasyNext: boolean;
  fouled: boolean;
};

export type OfcResult = {
  deltas: Record<string, number>;
  rows: Array<{
    memberId: string;
    front: string;
    middle: string;
    back: string;
    fouled: boolean;
    fantasyNext: boolean;
  }>;
};

export type OfcState = {
  handNo: number;
  street: "setting" | "showdown" | "waiting";
  deck: Card[];
  seats: OfcSeat[];
  button: number;
  toAct: number | null;
  /** 0 = initial 5-card set; then pineapple 3-card rounds. */
  dealRound: number;
  draft: Card[];
  unit: number;
  log: string[];
  result: OfcResult | null;
  endedAt: number | null;
};

export type OfcPlacement = { cardIndex: number; row: OfcRow };

function rowCapacity(row: OfcRow) {
  return row === "front" ? 3 : 5;
}

function setCount(s: OfcSeat) {
  return s.front.length + s.middle.length + s.back.length;
}

function pushLog(state: OfcState, msg: string) {
  state.log = [...state.log.slice(-40), msg];
}

function nextOfcSeat(state: OfcState, from: number) {
  const ordered = [...state.seats].sort((a, b) => a.seat - b.seat);
  const at = ordered.findIndex((s) => s.seat === from);
  const start = at >= 0 ? (at + 1) % ordered.length : 0;
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[(start + i) % ordered.length]!;
    if (setCount(s) < 13) return s.seat;
  }
  return null;
}

export function startOfcHand(
  seatsIn: Array<{
    seat: number;
    memberId: string;
    name: string;
    stack: number;
    isBot?: boolean;
    fantasy?: boolean;
  }>,
  opts: { handNo: number; button: number; unit: number },
): OfcState {
  const seats: OfcSeat[] = seatsIn
    .filter((s) => s.stack > 0)
    .map((s) => ({
      seat: s.seat,
      memberId: s.memberId,
      name: s.name,
      stack: s.stack,
      isBot: Boolean(s.isBot),
      front: [],
      middle: [],
      back: [],
      fantasyNext: Boolean(s.fantasy),
      fouled: false,
    }));

  const state: OfcState = {
    handNo: opts.handNo,
    street: "setting",
    deck: shuffle(freshDeck()),
    seats,
    button: opts.button,
    toAct: null,
    dealRound: 0,
    draft: [],
    unit: Math.max(1, opts.unit),
    log: [],
    result: null,
    endedAt: null,
  };

  if (seats.length < 2) {
    state.street = "waiting";
    return state;
  }

  // Initial 5 to the first actor (button+1), sequential set — ClubGG style
  // progressive: each player sets their 5 before the next is dealt.
  const first = nextOfcSeat(state, opts.button) ?? seats[0]!.seat;
  dealDraft(state, first, 5);
  pushLog(state, `OFC hand #${opts.handNo} · set 5`);
  return state;
}

function dealDraft(state: OfcState, seatNo: number, n: number) {
  state.toAct = seatNo;
  state.draft = [];
  for (let i = 0; i < n; i++) {
    const c = state.deck.pop();
    if (!c) break;
    state.draft.push(c);
  }
}

function placeCards(
  seat: OfcSeat,
  draft: Card[],
  placements: OfcPlacement[],
) {
  const used = new Set<number>();
  for (const p of placements) {
    if (used.has(p.cardIndex)) throw new Error("Duplicate card");
    if (p.cardIndex < 0 || p.cardIndex >= draft.length) {
      throw new Error("Bad card index");
    }
    used.add(p.cardIndex);
    const row = seat[p.row];
    if (row.length >= rowCapacity(p.row)) {
      throw new Error(`${p.row} is full`);
    }
    row.push(draft[p.cardIndex]!);
  }
}

export function applyOfcSet(
  state: OfcState,
  seatNo: number,
  placements: OfcPlacement[],
  discardIndex: number | null = null,
): OfcState {
  if (state.street !== "setting") throw new Error("Not setting");
  if (state.toAct !== seatNo) throw new Error("Not your turn");
  const seat = state.seats.find((s) => s.seat === seatNo);
  if (!seat) throw new Error("Seat not found");

  const draft = state.draft;
  if (draft.length === 5) {
    if (placements.length !== 5) throw new Error("Set all 5 cards");
    if (discardIndex != null) throw new Error("No discard on first deal");
    placeCards(seat, draft, placements);
  } else if (draft.length === 3) {
    if (placements.length !== 2) throw new Error("Place 2, discard 1");
    if (discardIndex == null || discardIndex < 0 || discardIndex > 2) {
      throw new Error("Discard required");
    }
    if (placements.some((p) => p.cardIndex === discardIndex)) {
      throw new Error("Cannot place discarded card");
    }
    placeCards(seat, draft, placements);
  } else {
    throw new Error("Nothing to set");
  }

  state.draft = [];
  pushLog(
    state,
    `${seat.name} sets · F${seat.front.length}/M${seat.middle.length}/B${seat.back.length}`,
  );

  if (state.seats.every((s) => setCount(s) >= 13)) {
    finishOfc(state);
    return state;
  }

  // Same player may need another pineapple deal, else next incomplete seat.
  const sameNeedsMore = setCount(seat) < 13;
  const next = sameNeedsMore
    ? seatNo
    : nextOfcSeat(state, seatNo) ?? nextOfcSeat(state, state.button);
  if (next == null) {
    finishOfc(state);
    return state;
  }
  state.dealRound += 1;
  const nextSeat = state.seats.find((s) => s.seat === next)!;
  const dealN = setCount(nextSeat) === 0 ? 5 : 3;
  dealDraft(state, next, dealN);
  return state;
}

function scoreFrontRoyalties(score: HandScore): number {
  const cat = score[0] ?? 0;
  if (cat >= 3) return 10 + Math.max(0, (score[1] ?? 0) - 2); // trips 66+=10…
  if (cat === 1) {
    const pair = score[1] ?? 0;
    if (pair < 6) return 0;
    return pair - 5; // 66=1 … AA=9
  }
  return 0;
}

function scoreFiveRoyalties(score: HandScore, middle: boolean): number {
  const cat = score[0] ?? 0;
  // Middle royalties are higher; back is standard.
  const table: Record<number, number> = middle
    ? { 3: 2, 4: 4, 5: 8, 6: 12, 7: 20, 8: 30 }
    : { 4: 2, 5: 4, 6: 6, 7: 10, 8: 15 };
  return table[cat] ?? 0;
}

function isFoul(seat: OfcSeat): boolean {
  if (seat.front.length !== 3 || seat.middle.length !== 5 || seat.back.length !== 5) {
    return true;
  }
  const f = evaluateThree(seat.front);
  const m = evaluateFive(seat.middle);
  const b = evaluateFive(seat.back);
  // back >= middle >= front
  if (cmpScore(b, m) < 0) return true;
  if (cmpScore(m, f) < 0) return true;
  return false;
}

function qualifiesFantasy(seat: OfcSeat): boolean {
  if (seat.fouled) return false;
  const f = evaluateThree(seat.front);
  if ((f[0] ?? 0) >= 3) return true; // trips
  if ((f[0] ?? 0) === 1 && (f[1] ?? 0) >= 12) return true; // QQ+
  return false;
}

export function finishOfc(state: OfcState) {
  for (const s of state.seats) {
    s.fouled = isFoul(s);
    s.fantasyNext = qualifiesFantasy(s);
  }

  const deltas: Record<string, number> = {};
  for (const s of state.seats) deltas[s.memberId] = 0;

  const n = state.seats.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = state.seats[i]!;
      const b = state.seats[j]!;
      let pts = 0; // points a wins from b
      if (a.fouled && b.fouled) {
        pts = 0;
      } else if (a.fouled) {
        pts = -6; // foul pays 6 to clean player (3 rows + scoop)
      } else if (b.fouled) {
        pts = 6;
      } else {
        const af = evaluateThree(a.front);
        const bf = evaluateThree(b.front);
        const am = evaluateFive(a.middle);
        const bm = evaluateFive(b.middle);
        const ab = evaluateFive(a.back);
        const bb = evaluateFive(b.back);
        let wins = 0;
        if (cmpScore(af, bf) > 0) wins += 1;
        else if (cmpScore(af, bf) < 0) wins -= 1;
        if (cmpScore(am, bm) > 0) wins += 1;
        else if (cmpScore(am, bm) < 0) wins -= 1;
        if (cmpScore(ab, bb) > 0) wins += 1;
        else if (cmpScore(ab, bb) < 0) wins -= 1;
        pts = wins;
        if (wins === 3) pts += 3; // scoop
        if (wins === -3) pts -= 3;
        pts +=
          scoreFrontRoyalties(af) -
          scoreFrontRoyalties(bf) +
          scoreFiveRoyalties(am, true) -
          scoreFiveRoyalties(bm, true) +
          scoreFiveRoyalties(ab, false) -
          scoreFiveRoyalties(bb, false);
      }
      const chips = pts * state.unit;
      deltas[a.memberId] = (deltas[a.memberId] || 0) + chips;
      deltas[b.memberId] = (deltas[b.memberId] || 0) - chips;
    }
  }

  for (const s of state.seats) {
    const d = deltas[s.memberId] || 0;
    s.stack = Math.max(0, s.stack + d);
  }

  state.result = {
    deltas,
    rows: state.seats.map((s) => ({
      memberId: s.memberId,
      front:
        s.front.length === 3 ? handName(evaluateThree(s.front)) : "incomplete",
      middle:
        s.middle.length === 5 ? handName(evaluateFive(s.middle)) : "incomplete",
      back: s.back.length === 5 ? handName(evaluateFive(s.back)) : "incomplete",
      fouled: s.fouled,
      fantasyNext: s.fantasyNext,
    })),
  };
  state.street = "showdown";
  state.toAct = null;
  state.endedAt = Date.now();
  pushLog(state, "OFC showdown");
}

/** Simple bot: fill back → middle → front from strongest ranks. */
export function decideOfcBot(
  state: OfcState,
  seatNo: number,
): { placements: OfcPlacement[]; discardIndex: number | null } {
  const seat = state.seats.find((s) => s.seat === seatNo)!;
  const draft = state.draft;
  const ranked = draft
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.r - a.c.r);

  if (draft.length === 5) {
    const placements: OfcPlacement[] = [];
    const order: OfcRow[] = ["back", "back", "middle", "middle", "front"];
    ranked.forEach((item, idx) => {
      placements.push({ cardIndex: item.i, row: order[idx]! });
    });
    // Fix capacities if front/middle/back already partially filled.
    return repairPlacements(seat, draft, placements, null);
  }

  // Pineapple: keep top 2, discard weakest.
  const discardIndex = ranked[2]!.i;
  const keep = ranked.slice(0, 2);
  const placements: OfcPlacement[] = keep.map((item) => {
    if (seat.back.length < 5) return { cardIndex: item.i, row: "back" as const };
    if (seat.middle.length < 5)
      return { cardIndex: item.i, row: "middle" as const };
    return { cardIndex: item.i, row: "front" as const };
  });
  return repairPlacements(seat, draft, placements, discardIndex);
}

function repairPlacements(
  seat: OfcSeat,
  draft: Card[],
  placements: OfcPlacement[],
  discardIndex: number | null,
): { placements: OfcPlacement[]; discardIndex: number | null } {
  const copy = {
    front: [...seat.front],
    middle: [...seat.middle],
    back: [...seat.back],
  };
  const fixed: OfcPlacement[] = [];
  for (const p of placements) {
    let row = p.row;
    if (copy[row].length >= rowCapacity(row)) {
      row =
        copy.back.length < 5
          ? "back"
          : copy.middle.length < 5
            ? "middle"
            : "front";
    }
    copy[row].push(draft[p.cardIndex]!);
    fixed.push({ cardIndex: p.cardIndex, row });
  }
  return { placements: fixed, discardIndex };
}

export function serializeOfcCards(cards: Card[]) {
  return cards.map(cardId);
}
