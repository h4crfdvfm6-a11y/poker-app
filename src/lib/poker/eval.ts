import type { Card } from "./cards";

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

export function bestOfSeven(hole: Card[], board: Card[]): {
  score: HandScore;
  cards: Card[];
} {
  const all = [...hole, ...board];
  if (all.length < 5) {
    return { score: [-1], cards: all };
  }
  let bestScore: HandScore | null = null;
  let bestCards: Card[] = [];
  const n = all.length;
  for (let a = 0; a < n - 4; a++) {
    for (let b = a + 1; b < n - 3; b++) {
      for (let c = b + 1; c < n - 2; c++) {
        for (let d = c + 1; d < n - 1; d++) {
          for (let e = d + 1; e < n; e++) {
            const five = [all[a]!, all[b]!, all[c]!, all[d]!, all[e]!];
            const score = evaluateFive(five);
            if (!bestScore || cmpScore(score, bestScore) > 0) {
              bestScore = score;
              bestCards = five;
            }
          }
        }
      }
    }
  }
  return { score: bestScore!, cards: bestCards };
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

/** AAAJJ+ means full house aces over jacks or better (full house A over Q/K, quads, SF). */
export function meetsBbjpTrigger(score: HandScore, trigger: string): boolean {
  const cat = score[0] ?? -1;
  if (cat > CAT.fullHouse) return true; // quads / SF
  if (cat < CAT.fullHouse) return false;
  const trip = score[1] ?? 0;
  const pair = score[2] ?? 0;
  const map: Record<string, [number, number]> = {
    AAA22: [14, 2],
    AAA88: [14, 8],
    AAAJJ: [14, 11],
    AAAKK: [14, 13],
  };
  const need = map[trigger] ?? [14, 11];
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

export { CAT, uniqueSortedRanks };
