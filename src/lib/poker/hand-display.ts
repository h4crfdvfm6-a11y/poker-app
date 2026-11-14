import type { Card } from "./cards";
import { parseCard } from "./cards";
import { bestHand, handName } from "./eval";
import type { GameType } from "./variants";

export type PremiumTier = "AA" | "KK" | "QQ" | "JJ" | "TT" | "AK" | null;

/** Preflop premium for Hold'em-style two-card starts (also works on first two Omaha cards for UI flair). */
export function detectPremium(hole: Card[]): PremiumTier {
  if (hole.length < 2) return null;
  const ranks = hole.map((c) => c.r).sort((a, b) => b - a);
  const [a, b] = ranks;
  if (a === 14 && b === 14) return "AA";
  if (a === 13 && b === 13) return "KK";
  if (a === 12 && b === 12) return "QQ";
  if (a === 11 && b === 11) return "JJ";
  if (a === 10 && b === 10) return "TT";
  if (a === 14 && b === 13) return "AK";
  return null;
}

export function premiumIntensity(tier: PremiumTier): number {
  switch (tier) {
    case "AA":
      return 1;
    case "KK":
      return 0.85;
    case "QQ":
      return 0.7;
    case "JJ":
      return 0.55;
    case "TT":
      return 0.4;
    case "AK":
      return 0.45;
    default:
      return 0;
  }
}

export function describeMadeHand(
  holeIds: string[],
  boardIds: string[],
  game: GameType = "NLH",
): { label: string; premium: PremiumTier; intensity: number } | null {
  if (!holeIds.length || holeIds.every((c) => c === "xx")) return null;
  try {
    const hole = holeIds.filter((c) => c !== "xx").map(parseCard);
    const board = boardIds.map(parseCard);
    const premium = detectPremium(hole);
    if (board.length < 3) {
      return {
        label: premium ? `Premium ${premium}` : "Hole cards",
        premium,
        intensity: premiumIntensity(premium),
      };
    }
    const { score } = bestHand(hole, board, game);
    return {
      label: handName(score).toUpperCase(),
      premium,
      intensity: premiumIntensity(premium),
    };
  } catch {
    return null;
  }
}

/** Short coach tips for practice mode — never for live multiplayer tables. */
export function beginnerCoachTip(
  holeIds: string[],
  boardIds: string[],
  street: string,
  game: GameType = "NLH",
): string {
  const made = describeMadeHand(holeIds, boardIds, game);
  if (!made) return "Wait for your cards.";
  if (street === "preflop") {
    if (made.premium === "AA" || made.premium === "KK") {
      return "You have a premium pair. Raise for value; don't limp.";
    }
    if (made.premium === "AK") {
      return "Ace-King is strong but not a made hand yet — raise and see a flop.";
    }
    return "Fold weak hands in early position; play tighter when unsure.";
  }
  if (boardIds.length >= 3) {
    const hearts = boardIds.filter((c) => c[1] === "h").length;
    const diamonds = boardIds.filter((c) => c[1] === "d").length;
    const flushDraw =
      Math.max(hearts, diamonds) >= 2 &&
      !made.label.includes("FLUSH") &&
      !made.label.includes("STRAIGHT FLUSH");
    if (made.label.includes("PAIR") && made.label.startsWith("ONE")) {
      return "You have one pair. Think about position and whether the board is wet.";
    }
    if (flushDraw) {
      return "There are suited cards on the board — you may be drawing to a flush.";
    }
    if (made.label.includes("FULL HOUSE") || made.label.includes("FOUR")) {
      return "Very strong made hand — look for value bets.";
    }
  }
  return `You currently hold ${made.label.toLowerCase()}.`;
}
