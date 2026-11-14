import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCard } from "./cards";
import { applyOfcSet, decideOfcBot, finishOfc, startOfcHand } from "./ofc";

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

test("OFC settlement never pays more than the loser's stack", () => {
  const state = startOfcHand(
    [
      { seat: 0, memberId: "a", name: "A", stack: 50 },
      { seat: 1, memberId: "b", name: "B", stack: 5000 },
    ],
    { handNo: 3, button: 0, unit: 100 },
  );
  const a = state.seats[0]!;
  const b = state.seats[1]!;
  // Incomplete board ⇒ foul. B is clean.
  a.front = [parseCard("9h"), parseCard("9d"), parseCard("9c")];
  a.middle = [parseCard("8h"), parseCard("7d")];
  a.back = [];
  b.front = [parseCard("Ah"), parseCard("Kd"), parseCard("2c")];
  b.middle = [
    parseCard("Kh"),
    parseCard("Qd"),
    parseCard("Jc"),
    parseCard("Tc"),
    parseCard("9s"),
  ];
  b.back = [
    parseCard("Qh"),
    parseCard("Qd"),
    parseCard("Qc"),
    parseCard("Qs"),
    parseCard("5c"),
  ];
  finishOfc(state);
  assert.equal(a.fouled, true);
  assert.equal(b.fouled, false);
  assert.equal(a.stack, 0);
  assert.equal(a.stack + b.stack, 50 + 5000);
});

test("OFC Fantasyland deals 14 cards", () => {
  const state = startOfcHand(
    [
      { seat: 0, memberId: "a", name: "A", stack: 5000, fantasy: true },
      { seat: 1, memberId: "b", name: "B", stack: 5000 },
    ],
    { handNo: 4, button: 1, unit: 100 },
  );
  // Button is 1 → first actor is seat 0 (fantasy).
  assert.equal(state.toAct, 0);
  assert.equal(state.draft.length, 14);
  assert.equal(state.seats[0]!.inFantasy, true);
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
