/** ClubGG-style ring variants supported in FA Poker. */

export type GameType = "NLH" | "PLO" | "PLO5" | "SHORT_DECK";

export const GAME_TYPES: GameType[] = ["NLH", "PLO", "PLO5", "SHORT_DECK"];

export function isGameType(v: string): v is GameType {
  return (GAME_TYPES as string[]).includes(v);
}

export function holeCardCount(game: GameType): number {
  switch (game) {
    case "PLO":
      return 4;
    case "PLO5":
      return 5;
    default:
      return 2;
  }
}

export function isOmaha(game: GameType): boolean {
  return game === "PLO" || game === "PLO5";
}

export function isPotLimit(game: GameType): boolean {
  return isOmaha(game);
}

export function gameTypeLabel(game: GameType): string {
  switch (game) {
    case "NLH":
      return "No-Limit Hold'em";
    case "PLO":
      return "Pot-Limit Omaha";
    case "PLO5":
      return "Pot-Limit Omaha 5";
    case "SHORT_DECK":
      return "Short Deck (6+)";
  }
}
