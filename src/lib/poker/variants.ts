/** ClubGG / GGPoker-style ring variants supported in FA Poker. */

export type GameType =
  | "NLH"
  | "PLO"
  | "PLO5"
  | "PLO6"
  | "PLO_HILO"
  | "SHORT_DECK"
  | "AOF_NLH"
  | "AOF_PLO"
  | "BOMB_NLH"
  | "OFC_PINEAPPLE";

export const GAME_TYPES: GameType[] = [
  "NLH",
  "PLO",
  "PLO5",
  "PLO6",
  "PLO_HILO",
  "SHORT_DECK",
  "AOF_NLH",
  "AOF_PLO",
  "BOMB_NLH",
  "OFC_PINEAPPLE",
];

export function isGameType(v: string): v is GameType {
  return (GAME_TYPES as string[]).includes(v);
}

export function holeCardCount(game: GameType): number {
  switch (game) {
    case "PLO":
    case "PLO_HILO":
    case "AOF_PLO":
      return 4;
    case "PLO5":
      return 5;
    case "PLO6":
      return 6;
    default:
      return 2;
  }
}

export function isOmaha(game: GameType): boolean {
  return (
    game === "PLO" ||
    game === "PLO5" ||
    game === "PLO6" ||
    game === "PLO_HILO" ||
    game === "AOF_PLO"
  );
}

export function isPotLimit(game: GameType): boolean {
  return (
    game === "PLO" ||
    game === "PLO5" ||
    game === "PLO6" ||
    game === "PLO_HILO"
  );
}

export function isAllInOrFold(game: GameType): boolean {
  return game === "AOF_NLH" || game === "AOF_PLO";
}

export function isBombPot(game: GameType): boolean {
  return game === "BOMB_NLH";
}

export function isOfc(game: GameType): boolean {
  return game === "OFC_PINEAPPLE";
}

export function isHiLo(game: GameType): boolean {
  return game === "PLO_HILO";
}

export function gameTypeLabel(game: GameType): string {
  switch (game) {
    case "NLH":
      return "No-Limit Hold'em";
    case "PLO":
      return "Pot-Limit Omaha";
    case "PLO5":
      return "Pot-Limit Omaha 5";
    case "PLO6":
      return "Pot-Limit Omaha 6";
    case "PLO_HILO":
      return "PLO Hi-Lo";
    case "SHORT_DECK":
      return "Short Deck (6+)";
    case "AOF_NLH":
      return "All-in or Fold Hold'em";
    case "AOF_PLO":
      return "All-in or Fold Omaha";
    case "BOMB_NLH":
      return "Bomb Pot Hold'em";
    case "OFC_PINEAPPLE":
      return "Open Face Chinese (Pineapple)";
  }
}
