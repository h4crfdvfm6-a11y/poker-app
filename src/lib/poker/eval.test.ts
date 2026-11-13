import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCard } from "./cards";
import {
  bestHand,
  bestOmaha,
  bestOmahaLow,
  cmpScoreShortDeck,
  evaluateFiveShortDeck,
  handName,
  meetsBbjpTrigger,
} from "./eval";
import { describeMadeHand, detectPremium } from "./hand-display";

const C = (s: string) => parseCard(s);

test("NLH flush beats straight", () => {
  const { score } = bestHand(
    [C("Ah"), C("Kh")],
    [C("Qh"), C("Jh"), C("2h"), C("9c"), C("8d")],
    "NLH",
  );
  assert.equal(handName(score), "Flush");
});

test("Omaha must use exactly two hole cards", () => {
  // Board has three aces; hole has no ace — Omaha trips, not quads.
  const omaha = bestOmaha(
    [C("Kd"), C("Qc"), C("Jh"), C("9s")],
    [C("Ah"), C("Ad"), C("Ac"), C("2s"), C("3d")],
  );
  assert.equal(handName(omaha.score), "Three of a Kind");
  const nlh = bestHand(
    [C("Kd"), C("Qc")],
    [C("Ah"), C("Ad"), C("Ac"), C("2s"), C("3d")],
    "NLH",
  );
  assert.equal(handName(nlh.score), "Three of a Kind");
});

test("Short deck flush beats full house for ranking", () => {
  const flush = evaluateFiveShortDeck([
    C("As"),
    C("Ks"),
    C("Qs"),
    C("Js"),
    C("9s"),
  ]);
  const fh = evaluateFiveShortDeck([C("Ah"), C("Ad"), C("Ac"), C("Kh"), C("Kd")]);
  assert.equal(handName(flush), "Flush");
  assert.equal(handName(fh), "Full House");
  assert.ok(cmpScoreShortDeck(flush, fh) > 0);
  assert.equal(meetsBbjpTrigger(flush, "AAAKK"), false);
  assert.equal(meetsBbjpTrigger(fh, "AAAKK"), true);
});

test("PLO hi-lo qualifies A2345", () => {
  const low = bestOmahaLow(
    [C("As"), C("2d"), C("Kh"), C("Qc")],
    [C("3c"), C("4h"), C("5d"), C("Kd"), C("Qs")],
  );
  assert.ok(low.score);
  assert.deepEqual(low.score, [5, 4, 3, 2, 1]);
});

test("premium and hand display", () => {
  assert.equal(detectPremium([C("As"), C("Ah")]), "AA");
  assert.equal(detectPremium([C("As"), C("Kh")]), "AK");
  const made = describeMadeHand(["As", "Ah"], ["Kd", "Kc", "2s"], "NLH");
  assert.equal(made?.label, "TWO PAIR");
});
