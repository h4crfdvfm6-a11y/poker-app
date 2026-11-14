import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOfcSet, decideOfcBot, startOfcHand } from "./ofc";

test("OFC pineapple deals 5 then 3 and reaches showdown", () => {
  let state = startOfcHand(
    [
      {
        seat: 0,
        memberId: "a",
        name: "A",
        stack: 5000,
        isBot: false,
      },
      {
        seat: 1,
        memberId: "b",
        name: "B",
        stack: 5000,
        isBot: true,
      },
    ],
    { handNo: 1, button: 0, unit: 100 },
  );
  assert.equal(state.street, "setting");
  assert.equal(state.draft.length, 5);

  // Play out with bot decisions for both until showdown.
  let guard = 0;
  while (state.street === "setting" && guard++ < 40) {
    const seat = state.toAct!;
    const decision = decideOfcBot(state, seat);
    state = applyOfcSet(
      state,
      seat,
      decision.placements,
      decision.discardIndex,
    );
  }
  assert.equal(state.street, "showdown");
  assert.ok(state.result);
  assert.equal(state.seats[0]!.front.length, 3);
  assert.equal(state.seats[0]!.middle.length, 5);
  assert.equal(state.seats[0]!.back.length, 5);
});

test("OFC rejects check-style incomplete first set", () => {
  const state = startOfcHand(
    [
      { seat: 0, memberId: "a", name: "A", stack: 1000 },
      { seat: 1, memberId: "b", name: "B", stack: 1000 },
    ],
    { handNo: 2, button: 0, unit: 50 },
  );
  assert.throws(() =>
    applyOfcSet(state, state.toAct!, [
      { cardIndex: 0, row: "back" },
      { cardIndex: 1, row: "back" },
    ]),
  );
});
