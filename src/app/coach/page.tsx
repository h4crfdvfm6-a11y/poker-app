"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  startHand,
  applyAction,
  serializeCards,
  type EngineState,
} from "@/lib/poker/engine";
import { decideBotAction } from "@/lib/poker/bots";
import { beginnerCoachTip, describeMadeHand } from "@/lib/poker/hand-display";

function freshPractice(): EngineState {
  return startHand(
    [
      { seat: 0, memberId: "you", name: "You", stack: 5000, isBot: false },
      { seat: 1, memberId: "bot_a", name: "AI Tight", stack: 5000, isBot: true },
      { seat: 2, memberId: "bot_b", name: "AI Loose", stack: 5000, isBot: true },
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
}

export default function CoachPage() {
  const [state, setState] = useState<EngineState>(() => freshPractice());
  const [log, setLog] = useState<string[]>([]);

  const you = state.seats.find((s) => s.memberId === "you")!;
  const hole = serializeCards(you.hole);
  const board = serializeCards(state.board);
  const made = useMemo(
    () => describeMadeHand(hole, board, "NLH"),
    [hole, board],
  );
  const tip = useMemo(
    () => beginnerCoachTip(hole, board, state.street, "NLH"),
    [hole, board, state.street],
  );

  function runBots(next: EngineState) {
    let cur = next;
    for (let i = 0; i < 8; i++) {
      if (cur.toAct == null || cur.street === "showdown") break;
      const actor = cur.seats.find((s) => s.seat === cur.toAct);
      if (!actor?.isBot) break;
      const d = decideBotAction(cur, actor.seat);
      cur = applyAction(cur, actor.seat, d.type, d.amount ?? 0);
    }
    return cur;
  }

  function act(type: "fold" | "check" | "call" | "bet" | "raise" | "allin", amount = 0) {
    if (state.toAct !== you.seat) return;
    try {
      let next = applyAction(state, you.seat, type, amount);
      next = runBots(next);
      setState({ ...next });
      setLog(next.log.slice(-8));
    } catch (e) {
      setLog((l) => [...l, e instanceof Error ? e.message : "Bad action"]);
    }
  }

  function nextHand() {
    const n = freshPractice();
    setState(runBots(n));
    setLog([]);
  }

  const toCall = Math.max(0, state.currentBet - you.bet);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <Link href="/lobby" className="brand text-xl text-[var(--gold-strong)]">
            Coach
          </Link>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Practice only — tips never appear on live cash tables.
          </p>
        </div>
        <button className="btn btn-ghost !py-2 !text-sm" onClick={nextHand}>
          New hand
        </button>
      </div>

      <div className="panel mb-4 p-4">
        <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Coach tip
        </div>
        <p className="mt-2 text-sm leading-relaxed">{tip}</p>
        {made ? (
          <div className="mt-3 text-[var(--gold-strong)]">{made.label}</div>
        ) : null}
      </div>

      <div className="panel mb-4 p-4">
        <div className="mb-2 text-xs text-[var(--muted)]">
          {state.street.toUpperCase()} · Pot{" "}
          {state.seats.reduce((a, s) => a + s.contributed, 0) +
            state.pots.reduce((a, p) => a + p.amount, 0)}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {board.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
        <div className="mb-1 text-xs text-[var(--muted)]">Your cards</div>
        <div className="flex gap-2">
          {hole.map((c) => (
            <span key={c} className="chip bg-[var(--gold)] text-[#1d1404]">
              {c}
            </span>
          ))}
        </div>
      </div>

      {state.street === "showdown" ? (
        <button className="btn btn-gold mb-4 w-full" onClick={nextHand}>
          Deal next practice hand
        </button>
      ) : state.toAct === you.seat ? (
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button className="btn btn-danger" onClick={() => act("fold")}>
            Fold
          </button>
          {toCall === 0 ? (
            <button className="btn btn-gold" onClick={() => act("check")}>
              Check
            </button>
          ) : (
            <button className="btn btn-gold" onClick={() => act("call")}>
              Call {toCall}
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() =>
              act(state.currentBet > 0 ? "raise" : "bet", state.currentBet + state.bb * 2)
            }
          >
            Bet/Raise
          </button>
          <button className="btn btn-ghost" onClick={() => act("allin")}>
            All-in
          </button>
        </div>
      ) : (
        <p className="mb-4 text-sm text-[var(--muted)]">Waiting for AI…</p>
      )}

      <div className="panel p-3 text-xs text-[var(--muted)]">
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </main>
  );
}