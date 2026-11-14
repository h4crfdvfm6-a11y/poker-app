import assert from "node:assert/strict";
import { test } from "node:test";
import { applyAction, startHand } from "./engine";

test("cucurucho deals flop after ante with pot-or-fold only", () => {
  const state = startHand(
    [
      {
        seat: 0,
        memberId: "a",
        name: "A",
        stack: 1000,
        isBot: false,
        sittingOut: false,
      },
      {
        seat: 1,
        memberId: "b",
        name: "B",
        stack: 1000,
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
      cucuruchoAnte: 250,
    },
  );
  assert.equal(state.cucurucho, true);
  assert.equal(state.street, "flop");
  assert.equal(state.board.length, 3);
  assert.equal(state.seats[0]!.stack, 750);
  assert.equal(state.seats[1]!.stack, 750);
  assert.ok(state.toAct != null);

  const actor = state.toAct!;
  assert.throws(() => applyAction(state, actor, "check"));
  const next = applyAction(state, actor, "bet");
  assert.ok(next.currentBet > 0);
  assert.ok(next.log.some((l) => /pots/i.test(l)));
});

test("cucurucho runout skips turn/river betting after flop action", () => {
  let state = startHand(
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
      gameType: "NLH",
      cucuruchoAnte: 50,
    },
  );
  const first = state.toAct!;
  state = applyAction(state, first, "bet");
  const second = state.toAct!;
  state = applyAction(state, second, "fold");
  assert.equal(state.street, "showdown");
  assert.ok(state.result);
});
