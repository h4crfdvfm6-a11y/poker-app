import assert from "node:assert/strict";
import { test } from "node:test";
import { startHand } from "./engine";

test("bomb pot all-in antes run out to showdown", () => {
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
      handNo: 1,
      button: 0,
      sb: 25,
      bb: 50,
      rakePercent: 0,
      rakeCapBb: 0,
      bbjpEnabled: false,
      bbjpTrigger: "AAAKK",
      gameType: "BOMB_NLH",
    },
  );
  assert.equal(state.street, "showdown");
  assert.ok(state.result);
  assert.equal(state.board.length, 5);
  assert.equal(state.toAct, null);
});

test("bomb pot with chips left starts on flop", () => {
  const state = startHand(
    [
      {
        seat: 0,
        memberId: "a",
        name: "A",
        stack: 500,
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
      handNo: 2,
      button: 0,
      sb: 25,
      bb: 50,
      rakePercent: 0,
      rakeCapBb: 0,
      bbjpEnabled: false,
      bbjpTrigger: "AAAKK",
      gameType: "BOMB_NLH",
    },
  );
  assert.equal(state.street, "flop");
  assert.equal(state.board.length, 3);
  assert.ok(state.toAct != null);
  assert.equal(state.result, null);
});
