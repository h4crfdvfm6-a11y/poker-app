export type Card = { r: number; s: number }; // rank 2-14 (A=14), suit 0-3

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

export function cardId(c: Card): string {
  return `${RANKS[c.r - 2]}${SUITS[c.s]}`;
}

export function parseCard(id: string): Card {
  const r = RANKS.indexOf(id[0]!.toUpperCase());
  const s = SUITS.indexOf(id[1]!.toLowerCase());
  if (r < 0 || s < 0) throw new Error(`Bad card ${id}`);
  return { r: r + 2, s };
}

export function freshDeck(): Card[] {
  const deck: Card[] = [];
  for (let s = 0; s < 4; s++) {
    for (let r = 2; r <= 14; r++) deck.push({ r, s });
  }
  return deck;
}

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function cardLabel(c: Card): string {
  return cardId(c);
}
