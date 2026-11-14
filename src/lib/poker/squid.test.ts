import assert from "node:assert/strict";
import { test } from "node:test";
import { startHand } from "./engine";

test("squid ante is taken after blinds so short stacks still post", () => {
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
  // A is button/SB in HU: posts 25, then has 50 left for full squid ante.
  const a = state.seats.find((s) => s.memberId === "a")!;
  const b = state.seats.find((s) => s.memberId === "b")!;
  assert.equal(a.bet, 25);
  assert.equal(b.bet, 50);
  assert.equal(state.squidCollected, 100);
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
  // Bomb ante consumes stacks; squid ante skipped for all-in seats.
  assert.equal(state.squidCollected, 0);
  assert.equal(state.street, "showdown");
  assert.ok(state.result);
  assert.equal(state.board.length, 5);
});

test("squid ante after bomb when chips remain", () => {
  const state = startHand(
    [
      {
        seat: 0,
        memberId: "a",
        name: "A",
        stack: 200,
        isBot: false,
        sittingOut: false,
      },
      {
        seat: 1,
        memberId: "b",
        name: "B",
        stack: 200,
        isBot: true,
        sittingOut: false,
      },
    ],
    {
      handNo: 3,
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
  assert.equal(state.street, "flop");
  assert.ok(state.toAct != null);
});
