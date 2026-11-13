"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type TableView = {
  meMemberId: string | null;
  meSeat: number | null;
  table: {
    id: string;
    title: string;
    sb: number;
    bb: number;
    seats: number;
    buyinMin: number;
    buyinMax: number;
    rakePercent: number;
    rakeCapBb: number;
    bbjpEnabled: boolean;
  };
  seats: Array<{
    seat: number;
    memberId: string | null;
    name: string;
    stack: number;
    isBot: boolean;
    empty: boolean;
  }>;
  hand: null | {
    handNo: number;
    street: string;
    board: string[];
    button: number;
    toAct: number | null;
    pot: number;
    currentBet: number;
    log: string[];
    result: null | {
      winners: Array<{ seat: number; amount: number; hand?: string }>;
      rake: number;
      bbjpFee: number;
      bbjpHit?: unknown;
    };
    seats: Array<{
      seat: number;
      memberId: string;
      name: string;
      stack: number;
      bet: number;
      folded: boolean;
      allIn: boolean;
      isBot: boolean;
      hole: string[];
    }>;
  };
  actions: Array<{ type: string; label: string; amount?: number }>;
  phase: string;
  version: number;
  bbjp: { balance: number; enabled: boolean; trigger: string };
};

const SEAT_POS = [
  "left-1/2 top-[8%] -translate-x-1/2",
  "right-[6%] top-[28%]",
  "right-[10%] bottom-[28%]",
  "left-1/2 bottom-[6%] -translate-x-1/2",
  "left-[10%] bottom-[28%]",
  "left-[6%] top-[28%]",
  "left-1/2 top-[2%] -translate-x-1/2",
  "right-[2%] top-[48%] -translate-y-1/2",
  "left-[2%] top-[48%] -translate-y-1/2",
];

function suitColor(card: string) {
  if (card === "xx") return "text-[var(--muted)]";
  const s = card[1];
  return s === "h" || s === "d" ? "text-[#ff6b6b]" : "text-[var(--ink)]";
}

function CardPipe({ card }: { card: string }) {
  if (card === "xx") {
    return (
      <div className="flex h-14 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-[#1a1030] text-xs text-[var(--muted)]">
        ██
      </div>
    );
  }
  return (
    <div
      className={`flex h-14 w-10 flex-col items-center justify-center rounded-md border border-white/20 bg-[#f7f1e4] font-bold ${suitColor(card)}`}
    >
      <span className="text-lg leading-none">{card[0]}</span>
      <span className="text-sm leading-none">
        {{ c: "♣", d: "♦", h: "♥", s: "♠" }[card[1]!] || card[1]}
      </span>
    </div>
  );
}

export default function TablePage() {
  const params = useParams<{ id: string }>();
  const tableId = params.id;
  const [view, setView] = useState<TableView | null>(null);
  const [error, setError] = useState("");
  const [buyIn, setBuyIn] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/table/${tableId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load table");
      return;
    }
    setView(json);
    if (!buyIn && json.table) setBuyIn(String(json.table.buyinMin));
  }, [tableId, buyIn]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 1200);
    return () => clearInterval(t);
  }, [load]);

  const seated = view?.meSeat != null;

  async function sit(seat: number) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/table/${tableId}/sit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seat, buyIn: Number(buyIn) }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not sit");
      return;
    }
    setView(json);
  }

  async function leave() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/table/${tableId}/leave`, { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not leave");
      return;
    }
    setView(json);
  }

  async function act(type: string, amount?: number) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/table/${tableId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, amount }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Action failed");
      return;
    }
    setView(json);
  }

  async function addBot() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/table/${tableId}/bot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not add AI");
      return;
    }
    setView(json);
  }

  if (!view) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-[var(--muted)]">
        Loading table…
      </main>
    );
  }

  const handSeats = view.hand?.seats ?? [];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <Link href="/lobby" className="text-sm text-[var(--gold)]">
            ← Lobby
          </Link>
          <h1 className="brand text-xl text-[var(--gold-strong)]">{view.table.title}</h1>
          <p className="text-xs text-[var(--muted)]">
            {view.table.sb}/{view.table.bb} · Rake {view.table.rakePercent}% /{" "}
            {view.table.rakeCapBb}BB
            {view.table.bbjpEnabled ? " · BBJP" : ""}
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <div>BBJP {view.bbjp.balance.toLocaleString()}</div>
          <div>{view.phase}</div>
        </div>
      </div>

      {error ? <p className="mb-2 text-sm text-[#ffb4b6]">{error}</p> : null}

      <div className="panel relative mb-3 h-[420px] overflow-hidden p-2">
        <div
          className="absolute inset-4 rounded-[40%] border border-[rgba(240,214,140,.2)]"
          style={{
            background:
              "radial-gradient(circle at 50% 40%, #2f8a58 0%, #145834 55%, #0c3a24 100%)",
          }}
        />
        <div className="absolute left-1/2 top-1/2 z-10 w-[70%] -translate-x-1/2 -translate-y-[58%] text-center">
          <div className="mb-2 text-xs uppercase tracking-wider text-white/70">
            Pot {view.hand?.pot?.toLocaleString() ?? 0}
          </div>
          <div className="flex justify-center gap-1">
            {(view.hand?.board?.length ? view.hand.board : []).map((c, i) => (
              <CardPipe key={`${c}-${i}`} card={c} />
            ))}
          </div>
          {view.hand?.result ? (
            <div className="mt-2 text-xs text-[var(--gold-strong)]">
              Rake {view.hand.result.rake}
              {view.hand.result.bbjpFee ? ` · BBJP fee ${view.hand.result.bbjpFee}` : ""}
            </div>
          ) : null}
        </div>

        {view.seats.map((seat) => {
          const live = handSeats.find((s) => s.seat === seat.seat);
          const active = view.hand?.toAct === seat.seat;
          return (
            <div
              key={seat.seat}
              className={`absolute z-20 w-28 -translate-x-1/2 ${SEAT_POS[seat.seat] || SEAT_POS[0]}`}
            >
              <button
                disabled={busy || !seat.empty}
                onClick={() => sit(seat.seat)}
                className={`w-full rounded-2xl border px-2 py-2 text-left ${
                  active
                    ? "border-[var(--gold)] bg-black/70 shadow-[0_0_0_1px_rgba(231,197,106,.35)]"
                    : "border-[var(--line)] bg-black/55"
                } ${live?.folded ? "opacity-40" : ""}`}
              >
                <div className="truncate text-xs font-semibold">
                  {seat.empty ? `Seat ${seat.seat + 1}` : seat.name}
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  {seat.empty ? "Tap to sit" : seat.stack.toLocaleString()}
                </div>
                {live?.bet ? (
                  <div className="text-[11px] text-[var(--gold)]">Bet {live.bet}</div>
                ) : null}
                {live?.hole?.length ? (
                  <div className="mt-1 flex gap-1">
                    {live.hole.map((c, i) => (
                      <div key={i} className="scale-75 origin-left">
                        <CardPipe card={c} />
                      </div>
                    ))}
                  </div>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="field !w-28 !py-2"
          type="number"
          value={buyIn}
          onChange={(e) => setBuyIn(e.target.value)}
          title="Buy-in"
        />
        <button className="btn btn-ghost !py-2 !text-sm" disabled={busy} onClick={addBot}>
          Add AI seat
        </button>
        {seated ? (
          <button className="btn btn-danger !py-2 !text-sm" disabled={busy} onClick={leave}>
            Leave table
          </button>
        ) : null}
      </div>

      {view.actions?.length ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {view.actions.map((a) => (
            <button
              key={a.label}
              className={`btn !py-3 ${a.type === "fold" ? "btn-danger" : "btn-gold"}`}
              disabled={busy}
              onClick={() => act(a.type, a.amount)}
            >
              {a.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-sm text-[var(--muted)]">
          Sit down and add an AI seat (or another player) to start a hand. Rake is taken from pots
          automatically.
        </p>
      )}

      <div className="panel max-h-40 overflow-auto p-3 text-xs text-[var(--muted)]">
        {(view.hand?.log || ["Waiting for players…"]).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </main>
  );
}
