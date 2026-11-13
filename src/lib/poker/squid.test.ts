import assert from "node:assert/strict";
import { test } from "node:test";
import { startHand, type EngineState } from "./engine";

/** Mirror of table-play award/collect helpers for unit coverage. */
function collectSquidAntes(
  state: EngineState,
  squid: { pot: number; scores: Record<string, number>; target: number },
  ante: number,
) {
  let pot = squid.pot;
  for (const seat of state.seats) {
    if (!seat.hole.length || seat.sittingOut) continue;
    const pay = Math.min(seat.stack, ante);
    if (pay <= 0) continue;
    seat.stack -= pay;
    pot += pay;
  }
  return { ...squid, pot };
}

function awardSquid(
  state: EngineState,
  squid: { pot: number; scores: Record<string, number>; target: number },
) {
  if (!state.result?.winners?.length) return squid;
  const winnerSeat = state.result.winners[0]!.seat;
  const winner = state.seats.find((s) => s.seat === winnerSeat);
  if (!winner?.memberId) return squid;
  const scores = { ...squid.scores };
  scores[winner.memberId] = (scores[winner.memberId] || 0) + 1;
  const count = scores[winner.memberId]!;
  if (count >= squid.target && squid.pot > 0) {
    winner.stack += squid.pot;
    return { pot: 0, scores: {}, target: squid.target };
  }
  return { ...squid, scores };
}

test("squid antes build pot and target claim pays winner", () => {
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
    },
  );
  let squid = { pot: 0, scores: {} as Record<string, number>, target: 2 };
  squid = collectSquidAntes(state, squid, 50);
  assert.equal(squid.pot, 100);

  state.result = {
    winners: [{ seat: 0, amount: 50 }],
    rake: 0,
    bbjpFee: 0,
  };
  squid = awardSquid(state, squid);
  assert.equal(squid.scores.a, 1);
  assert.equal(squid.pot, 100);

  state.result = {
    winners: [{ seat: 0, amount: 50 }],
    rake: 0,
    bbjpFee: 0,
  };
  const before = state.seats[0]!.stack;
  squid = awardSquid(state, squid);
  assert.equal(squid.pot, 0);
  assert.deepEqual(squid.scores, {});
  assert.equal(state.seats[0]!.stack, before + 100);
});
