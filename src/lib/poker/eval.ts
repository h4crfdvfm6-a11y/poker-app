import type { Card } from "./cards";
import type { GameType } from "./variants";
import { isOmaha } from "./variants";

/** Lower score is worse. Returns [category, ...kickers] comparable lexicographically. */
export type HandScore = number[];

const CAT = {
  high: 0,
  pair: 1,
  twoPair: 2,
  trips: 3,
  straight: 4,
  flush: 5,
  fullHouse: 6,
  quads: 7,
  straightFlush: 8,
} as const;

function uniqueSortedRanks(cards: Card[]): number[] {
  return [...new Set(cards.map((c) => c.r))].sort((a, b) => b - a);
}

function straightHigh(ranks: number[]): number | null {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1); // wheel
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (!set.has(high - i === 1 ? 1 : high - i)) {
        ok = false;
        break;
      }
    }
    if (ok) return high === 5 && set.has(14) && !set.has(6) ? 5 : high;
  }
  return null;
}

export function evaluateFive(cards: Card[]): HandScore {
  if (cards.length !== 5) throw new Error("Need 5 cards");
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0]!.s);
  const sHigh = straightHigh(ranks);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (flush && sHigh != null) return [CAT.straightFlush, sHigh];
  if (byCount[0]![1] === 4) {
    const quad = byCount[0]![0];
    const kicker = byCount.find((x) => x[0] !== quad)![0];
    return [CAT.quads, quad, kicker];
  }
  if (byCount[0]![1] === 3 && byCount[1]?.[1] === 2) {
    return [CAT.fullHouse, byCount[0]![0], byCount[1]![0]];
  }
  if (flush) return [CAT.flush, ...ranks];
  if (sHigh != null) return [CAT.straight, sHigh];
  if (byCount[0]![1] === 3) {
    const trip = byCount[0]![0];
    const kickers = byCount.filter((x) => x[0] !== trip).map((x) => x[0]);
    return [CAT.trips, trip, ...kickers];
  }
  if (byCount[0]![1] === 2 && byCount[1]?.[1] === 2) {
    const hi = Math.max(byCount[0]![0], byCount[1]![0]);
    const lo = Math.min(byCount[0]![0], byCount[1]![0]);
    const kicker = byCount.find((x) => x[1] === 1)![0];
    return [CAT.twoPair, hi, lo, kicker];
  }
  if (byCount[0]![1] === 2) {
    const pair = byCount[0]![0];
    const kickers = byCount.filter((x) => x[0] !== pair).map((x) => x[0]);
    return [CAT.pair, pair, ...kickers];
  }
  return [CAT.high, ...ranks];
}

/** Chinese poker front-row (3-card) evaluation. */
export function evaluateThree(cards: Card[]): HandScore {
  if (cards.length !== 3) throw new Error("Need 3 cards");
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  if (byCount[0]![1] === 3) return [CAT.trips, byCount[0]![0]];
  if (byCount[0]![1] === 2) {
    const pair = byCount[0]![0];
    const kicker = byCount.find((x) => x[0] !== pair)![0];
    return [CAT.pair, pair, kicker];
  }
  return [CAT.high, ...ranks];
}

function straightHighShort(ranks: number[]): number | null {
  const set = new Set(ranks);
  // A-6-7-8-9 is the short-deck wheel
  if ([14, 6, 7, 8, 9].every((r) => set.has(r))) return 9;
  for (let high = 14; high >= 10; high--) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if (!set.has(high - i)) {
        ok = false;
        break;
      }
    }
    if (ok) return high;
  }
  return null;
}

/**
 * Short-deck evaluation keeps semantic CAT values (flush=5, fullHouse=6)
 * so BBJP / handName stay correct. Ordering uses cmpScoreShortDeck.
 */
export function evaluateFiveShortDeck(cards: Card[]): HandScore {
  if (cards.length !== 5) throw new Error("Need 5 cards");
  const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
  const flush = cards.every((c) => c.s === cards[0]!.s);
  const sHigh = straightHighShort(ranks);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const byCount = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (flush && sHigh != null) return [CAT.straightFlush, sHigh];
  if (byCount[0]![1] === 4) {
    const quad = byCount[0]![0];
    const kicker = byCount.find((x) => x[0] !== quad)![0];
    return [CAT.quads, quad, kicker];
  }
  // Prefer flush over full house when both present — ranking handled by cmpScoreShortDeck
  if (flush) return [CAT.flush, ...ranks];
  if (byCount[0]![1] === 3 && byCount[1]?.[1] === 2) {
    return [CAT.fullHouse, byCount[0]![0], byCount[1]![0]];
  }
  if (sHigh != null) return [CAT.straight, sHigh];
  if (byCount[0]![1] === 3) {
    const trip = byCount[0]![0];
    const kickers = byCount.filter((x) => x[0] !== trip).map((x) => x[0]);
    return [CAT.trips, trip, ...kickers];
  }
  if (byCount[0]![1] === 2 && byCount[1]?.[1] === 2) {
    const hi = Math.max(byCount[0]![0], byCount[1]![0]);
    const lo = Math.min(byCount[0]![0], byCount[1]![0]);
    const kicker = byCount.find((x) => x[1] === 1)![0];
    return [CAT.twoPair, hi, lo, kicker];
  }
  if (byCount[0]![1] === 2) {
    const pair = byCount[0]![0];
    const kickers = byCount.filter((x) => x[0] !== pair).map((x) => x[0]);
    return [CAT.pair, pair, ...kickers];
  }
  return [CAT.high, ...ranks];
}

function shortDeckOrder(score: HandScore): HandScore {
  const cat = score[0] ?? -1;
  // Flush beats full house: swap those two category ranks for comparison only.
  if (cat === CAT.flush) return [CAT.fullHouse, ...score.slice(1)];
  if (cat === CAT.fullHouse) return [CAT.flush, ...score.slice(1)];
  return score;
}

export function cmpScoreShortDeck(a: HandScore, b: HandScore): number {
  return cmpScore(shortDeckOrder(a), shortDeckOrder(b));
}

function bestFromCombos(
  combos: Card[][],
  scoreFn: (five: Card[]) => HandScore,
  compare: (a: HandScore, b: HandScore) => number = cmpScore,
): { score: HandScore; cards: Card[] } {
  let bestScore: HandScore | null = null;
  let bestCards: Card[] = [];
  for (const five of combos) {
    const score = scoreFn(five);
    if (!bestScore || compare(score, bestScore) > 0) {
      bestScore = score;
      bestCards = five;
    }
  }
  return { score: bestScore ?? [-1], cards: bestCards };
}

export function bestOfSeven(hole: Card[], board: Card[]): {
  score: HandScore;
  cards: Card[];
} {
  const all = [...hole, ...board];
  if (all.length < 5) {
    return { score: [-1], cards: all };
  }
  const combos: Card[][] = [];
  const n = all.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            combos.push([all[a]!, all[b]!, all[c]!, all[d]!, all[e]!]);
          }
        }
      }
    }
  }
  return bestFromCombos(combos, evaluateFive);
}

/** Omaha: exactly two hole cards + three board cards. */
export function bestOmaha(hole: Card[], board: Card[]): {
  score: HandScore;
  cards: Card[];
} {
  if (hole.length < 2 || board.length < 3) {
    return { score: [-1], cards: [...hole, ...board] };
  }
  const combos: Card[][] = [];
  for (let i = 0; i < hole.length - 1; i++) {
    for (let j = i + 1; j < hole.length; j++) {
      for (let a = 0; a < board.length - 2; a++) {
        for (let b = a + 1; b < board.length - 1; b++) {
          for (let c = b + 1; c < board.length; c++) {
            combos.push([
              hole[i]!,
              hole[j]!,
              board[a]!,
              board[b]!,
              board[c]!,
            ]);
          }
        }
      }
    }
  }
  return bestFromCombos(combos, evaluateFive);
}

export function bestOfSevenShortDeck(hole: Card[], board: Card[]): {
  score: HandScore;
  cards: Card[];
} {
  const all = [...hole, ...board];
  if (all.length < 5) return { score: [-1], cards: all };
  const combos: Card[][] = [];
  const n = all.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            combos.push([all[a]!, all[b]!, all[c]!, all[d]!, all[e]!]);
          }
        }
      }
    }
  }
  return bestFromCombos(combos, evaluateFiveShortDeck, cmpScoreShortDeck);
}

function lowRank(r: number): number {
  return r === 14 ? 1 : r;
}

/** 8-or-better low: five distinct ranks all ≤8 (A=1). Lower high-card is better. */
export function evaluateLowEight(cards: Card[]): HandScore | null {
  if (cards.length !== 5) return null;
  const lows = cards.map((c) => lowRank(c.r));
  if (lows.some((r) => r < 1 || r > 8)) return null;
  if (new Set(lows).size !== 5) return null;
  return lows.sort((a, b) => b - a);
}

/** Compare lows: lower ranks win (opposite of high hands). */
export function cmpLowScore(a: HandScore, b: HandScore): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 99;
    const bv = b[i] ?? 99;
    if (av !== bv) return av < bv ? 1 : -1;
  }
  return 0;
}

export function bestOmahaLow(hole: Card[], board: Card[]): {
  score: HandScore | null;
  cards: Card[];
} {
  if (hole.length < 2 || board.length < 3) {
    return { score: null, cards: [...hole, ...board] };
  }
  let bestScore: HandScore | null = null;
  let bestCards: Card[] = [];
  for (let i = 0; i < hole.length - 1; i++) {
    for (let j = i + 1; j < hole.length; j++) {
      for (let a = 0; a < board.length - 2; a++) {
        for (let b = a + 1; b < board.length - 1; b++) {
          for (let c = b + 1; c < board.length; c++) {
            const five = [
              hole[i]!,
              hole[j]!,
              board[a]!,
              board[b]!,
              board[c]!,
            ];
            const score = evaluateLowEight(five);
            if (!score) continue;
            if (!bestScore || cmpLowScore(score, bestScore) > 0) {
              bestScore = score;
              bestCards = five;
            }
          }
        }
      }
    }
  }
  return { score: bestScore, cards: bestCards };
}

export function bestHand(
  hole: Card[],
  board: Card[],
  game: GameType = "NLH",
): { score: HandScore; cards: Card[] } {
  if (isOmaha(game)) return bestOmaha(hole, board);
  if (game === "SHORT_DECK") return bestOfSevenShortDeck(hole, board);
  return bestOfSeven(hole, board);
}

export function cmpScore(a: HandScore, b: HandScore): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  return 0;
}

export function cmpHands(
  a: HandScore,
  b: HandScore,
  game: GameType = "NLH",
): number {
  if (game === "SHORT_DECK") return cmpScoreShortDeck(a, b);
  return cmpScore(a, b);
}

/** AAAJJ+ means full house aces over jacks or better (full house A over Q/K, quads, SF). */
export function meetsBbjpTrigger(score: HandScore, trigger: string): boolean {
  const cat = score[0] ?? -1;
  if (cat > CAT.fullHouse) return true; // quads / SF
  if (cat < CAT.fullHouse) return false;
  const trip = score[1] ?? 0;
  const pair = score[2] ?? 0;
  const map: Record<string, [number, number]> = {
    AAA22: [14, 2],
    AAA33: [14, 3],
    AAA44: [14, 4],
    AAA55: [14, 5],
    AAA66: [14, 6],
    AAA77: [14, 7],
    AAA88: [14, 8],
    AAA99: [14, 9],
    AAA1010: [14, 10],
    AAATT: [14, 10],
    AAAJJ: [14, 11],
    AAAQQ: [14, 12],
    AAAKK: [14, 13],
  };
  const need = map[trigger] ?? [14, 13];
  if (trip > need[0]) return true;
  if (trip < need[0]) return false;
  return pair >= need[1];
}

export function handName(score: HandScore): string {
  switch (score[0]) {
    case CAT.straightFlush:
      return "Straight Flush";
    case CAT.quads:
      return "Four of a Kind";
    case CAT.fullHouse:
      return "Full House";
    case CAT.flush:
      return "Flush";
    case CAT.straight:
      return "Straight";
    case CAT.trips:
      return "Three of a Kind";
    case CAT.twoPair:
      return "Two Pair";
    case CAT.pair:
      return "One Pair";
    default:
      return "High Card";
  }
}

export function usesBothHoleCards(hole: Card[], five: Card[]): boolean {
  const fiveIds = new Set(five.map((c) => `${c.r}-${c.s}`));
  return hole.every((c) => fiveIds.has(`${c.r}-${c.s}`));
}

/** NLH: both hole cards in the five. Omaha: exactly two hole cards in the five. */
export function qualifiesBbjpHoleUse(
  hole: Card[],
  five: Card[],
  game: GameType = "NLH",
): boolean {
  const fiveIds = new Set(five.map((c) => `${c.r}-${c.s}`));
  const used = hole.filter((c) => fiveIds.has(`${c.r}-${c.s}`)).length;
  if (isOmaha(game)) return used === 2;
  return used === hole.length && hole.length >= 2;
}

export { CAT, uniqueSortedRanks };
