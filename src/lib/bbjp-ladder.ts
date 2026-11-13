/**
 * CSS-style BBJP collections ladder.
 * Minimum losing hand is driven by jackpot-cycle collections (not pool balance).
 * Inclusive £50 bands; whole pounds via floor. £50 stays AAAKK; £51 opens AAAQQ.
 */

const PAIR_LABELS = [
  "AAAKK",
  "AAAQQ",
  "AAAJJ",
  "AAA1010",
  "AAA99",
  "AAA88",
  "AAA77",
  "AAA66",
  "AAA55",
  "AAA44",
  "AAA33",
  "AAA22",
] as const;

export type BbjpLadderHand = (typeof PAIR_LABELS)[number];

/** Whole-pound cycle collections → minimum losing hand. */
export function minimumHandFromCollections(collections: number): BbjpLadderHand {
  const pounds = Math.floor(Math.max(0, Number(collections) || 0));
  const idx =
    pounds === 0 ? 0 : Math.min(PAIR_LABELS.length - 1, Math.floor((pounds - 1) / 50));
  return PAIR_LABELS[idx]!;
}

export function bbjpLadderBands(): Array<{
  min: number;
  max: number | null;
  hand: BbjpLadderHand;
}> {
  return PAIR_LABELS.map((hand, i) => ({
    min: i === 0 ? 0 : i * 50 + 1,
    max: i === PAIR_LABELS.length - 1 ? null : (i + 1) * 50,
    hand,
  }));
}
