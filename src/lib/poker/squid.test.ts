import assert from "node:assert/strict";
import { test } from "node:test";
import { startHand } from "./engine";

test("squid ante is taken before blinds and marks short stacks all-in", () => {
  const state = startHand(
    [
      {
        seat: 0,
        memberId: "a",
        name: "A",
        stack: 75,
        isBot: false,
        sittingOut: false,
      },
      {
        seat: 1,
        memberId: "b",
        name: "B",
        stack: 500,
        isBot: true,
        sittingOut: false,
      },
    ],
    {
      handNo: 1,
      button: 0,
      sb: 25,
      bb: 50,
      rakePercent: 0,
      rakeCapBb: 0,
      bbjpEnabled: false,
      bbjpTrigger: "AAAKK",
      gameType: "NLH",
      squidAnte: 50,
    },
  );
  assert.equal(state.squidCollected, 100);
  const a = state.seats.find((s) => s.memberId === "a")!;
  // 75 - 50 squid = 25, then posts SB 25 → all-in
  assert.equal(a.stack, 0);
  assert.equal(a.allIn, true);
  assert.ok(state.street === "preflop" || state.street === "showdown");
});

test("bomb pot with squid ante still runs out when both are short", () => {
  const state = startHand(
    [
      {
        seat: 0,
        memberId: "a",
        name: "A",
        stack: 50,
        isBot: false,
        sittingOut: false,
      },
      {
        seat: 1,
        memberId: "b",
        name: "B",
        stack: 50,
        isBot: true,
        sittingOut: false,
      },
    ],
    {
      handNo: 2,
      button: 0,
      sb: 25,
      bb: 50,
      rakePercent: 0,
      rakeCapBb: 0,
      bbjpEnabled: false,
      bbjpTrigger: "AAAKK",
      gameType: "BOMB_NLH",
      squidAnte: 50,
    },
  );
  assert.equal(state.squidCollected, 100);
  assert.equal(state.street, "showdown");
  assert.ok(state.result);
  assert.equal(state.board.length, 5);
});
