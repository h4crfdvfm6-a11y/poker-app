"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  playSound,
  setSoundsMuted,
  soundForAction,
  soundsMuted,
} from "@/lib/sounds";
import { CARD_BACK_STYLES, FELT_STYLES } from "@/lib/shop";

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
    format?: string;
    gameType?: string;
    status?: string;
  };
  tournament: null | {
    id: string;
    title: string;
    status: string;
    blindLevel: number;
    blindMinutes: number;
    prizePool: number;
    winnerMemberId: string | null;
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
  handStrength?: null | {
    label: string;
    premium: string | null;
    intensity: number;
  };
  cosmetics?: null | { avatar: string; felt: string; cardBack: string };
  actions: Array<{ type: string; label: string; amount?: number }>;
  sizing: null | {
    kind: "bet" | "raise";
    min: number;
    max: number;
    presets: number[];
  };
  phase: string;
  version: number;
  bbjp: {
    balance: number;
    enabled: boolean;
    trigger: string;
    collections?: number;
    minimumHand?: string;
  };
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

function CardPipe({
  card,
  premium,
  cardBack = "back_navy",
}: {
  card: string;
  premium?: boolean;
  cardBack?: string;
}) {
  if (card === "xx") {
    return (
      <div
        className="flex h-14 w-10 items-center justify-center rounded-md border border-[var(--line)] text-xs text-[var(--muted)]"
        style={{ background: CARD_BACK_STYLES[cardBack] || CARD_BACK_STYLES.back_navy }}
      >
        ██
      </div>
    );
  }
  return (
    <div
      className={`flex h-14 w-10 flex-col items-center justify-center rounded-md border border-white/20 bg-[#f7f1e4] font-bold ${suitColor(card)} ${
        premium ? "premium-glow" : ""
      }`}
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
  const [raiseTo, setRaiseTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [emojis, setEmojis] = useState<string[]>([
    "😂",
    "😎",
    "🔥",
    "😱",
    "👏",
    "❤️",
    "😭",
    "🤔",
    "🎉",
  ]);
  const [reactions, setReactions] = useState<
    Array<{ id: string; seat: number; emoji: string }>
  >([]);
  const lastPremium = useRef<string | null>(null);
  const lastHandNo = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/table/${tableId}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Failed to load table");
      return;
    }
    setView(json);
    if (!buyIn && json.table) setBuyIn(String(json.table.buyinMin));
    if (json.sizing) {
      setRaiseTo((prev) => {
        const n = Number(prev);
        if (!prev || n < json.sizing.min || n > json.sizing.max) {
          return String(json.sizing.min);
        }
        return prev;
      });
    }
  }, [tableId, buyIn]);

  useEffect(() => {
    setMuted(soundsMuted());
    void load();
    const t = setInterval(() => void load(), 1200);
    const r = setInterval(() => {
      void fetch(`/api/table/${tableId}/react`)
        .then((res) => res.json())
        .then((json) => {
          if (json.reactions) setReactions(json.reactions);
          if (json.emojis) setEmojis(json.emojis);
        })
        .catch(() => undefined);
    }, 900);
    return () => {
      clearInterval(t);
      clearInterval(r);
    };
  }, [load, tableId]);

  useEffect(() => {
    if (!view?.handStrength?.premium) return;
    const key = `${view.hand?.handNo}-${view.handStrength.premium}`;
    if (lastPremium.current === key) return;
    lastPremium.current = key;
    playSound("premium");
  }, [view?.handStrength, view?.hand?.handNo]);

  useEffect(() => {
    const handNo = view?.hand?.handNo ?? null;
    if (handNo != null && lastHandNo.current !== handNo) {
      if (lastHandNo.current != null) playSound("deal");
      lastHandNo.current = handNo;
    }
    if (view?.hand?.result) playSound("win");
  }, [view?.hand?.handNo, view?.hand?.result]);

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
    playSound(soundForAction(type));
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

  async function react(emoji: string) {
    playSound("react");
    const res = await fetch(`/api/table/${tableId}/react`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Reaction failed");
      return;
    }
    setReactions(json.reactions || []);
    if (json.emojis) setEmojis(json.emojis);
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
  const isTournament = view.table.format === "tournament" || Boolean(view.tournament);
  const tournamentDone = view.tournament?.status === "finished";
  const iWon =
    tournamentDone &&
    view.tournament?.winnerMemberId &&
    view.tournament.winnerMemberId === view.meMemberId;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-3 pb-8 pt-[max(12px,env(safe-area-inset-top))]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <Link href="/lobby" className="text-sm text-[var(--gold)]">
            ← Lobby
          </Link>
          <h1 className="brand text-xl text-[var(--gold-strong)]">{view.table.title}</h1>
          <p className="text-xs text-[var(--muted)]">
            {view.table.gameType || "NLH"} · {view.table.sb}/{view.table.bb}
            {isTournament
              ? ` · Level ${view.tournament?.blindLevel ?? 1} · Prize ${view.tournament?.prizePool?.toLocaleString() ?? 0}`
              : ` · Rake ${view.table.rakePercent}% / ${view.table.rakeCapBb}BB${view.table.bbjpEnabled ? " · BBJP" : ""}`}
          </p>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          {isTournament ? (
            <>
              <div>{view.tournament?.status ?? view.phase}</div>
              <div>Blinds every {view.tournament?.blindMinutes ?? "—"}m</div>
            </>
          ) : (
            <>
              <div className="bbjp-text font-semibold">
                BBJP {view.bbjp.balance.toLocaleString()}
              </div>
              <div>
                Min {view.bbjp.minimumHand || view.bbjp.trigger}
                {view.bbjp.collections != null
                  ? ` · cycle ${view.bbjp.collections.toLocaleString()}`
                  : ""}
              </div>
              <div>{view.phase}</div>
            </>
          )}
        </div>
      </div>

      {tournamentDone ? (
        <div className="panel mb-3 p-4 text-center">
          <div className="brand text-2xl text-[var(--gold-strong)]">
            {iWon ? "You won!" : "Tournament finished"}
          </div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Prize pool {view.tournament?.prizePool?.toLocaleString() ?? 0} club chips
            paid to the winner.
          </p>
        </div>
      ) : null}

      {error ? <p className="mb-2 text-sm text-[#ffb4b6]">{error}</p> : null}

      {view.handStrength ? (
        <div
          className={`mb-2 rounded-xl border border-[var(--line)] px-3 py-2 text-center ${
            view.handStrength.intensity > 0.5 ? "premium-banner" : "bg-black/25"
          }`}
        >
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Your hand
          </div>
          <div className="brand text-lg text-[var(--gold-strong)]">
            {view.handStrength.label}
          </div>
        </div>
      ) : null}

      <div className="panel relative mb-3 h-[420px] overflow-hidden p-2">
        <div
          className="absolute inset-4 rounded-[40%] border border-[rgba(240,214,140,.2)]"
          style={{
            background:
              FELT_STYLES[view.cosmetics?.felt || "felt_classic"] ||
              FELT_STYLES.felt_classic,
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
          const rx = reactions.find((r) => r.seat === seat.seat);
          const mine = view.meSeat === seat.seat;
          return (
            <div
              key={seat.seat}
              className={`absolute z-20 w-28 -translate-x-1/2 ${SEAT_POS[seat.seat] || SEAT_POS[0]}`}
            >
              <button
                disabled={busy || !seat.empty || isTournament}
                onClick={() => sit(seat.seat)}
                className={`w-full rounded-2xl border px-2 py-2 text-left ${
                  active
                    ? "border-[var(--gold)] bg-black/70 shadow-[0_0_0_1px_rgba(231,197,106,.35)]"
                    : "border-[var(--line)] bg-black/55"
                } ${live?.folded ? "opacity-40" : ""}`}
              >
                <div className="truncate text-xs font-semibold">
                  {seat.empty ? `Seat ${seat.seat + 1}` : seat.name}
                  {seat.isBot ? " · AI" : ""}
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  {seat.empty
                    ? isTournament
                      ? "Empty"
                      : "Tap to sit"
                    : seat.stack.toLocaleString()}
                </div>
                {live?.bet ? (
                  <div className="text-[11px] text-[var(--gold)]">Bet {live.bet}</div>
                ) : null}
                {live?.hole?.length ? (
                  <div className="mt-1 flex gap-1">
                    {live.hole.map((c, i) => (
                      <div key={i} className="origin-left scale-75">
                        <CardPipe
                          card={c}
                          premium={Boolean(mine && view.handStrength?.premium)}
                          cardBack={view.cosmetics?.cardBack}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </button>
              {rx ? (
                <div className="reaction-float pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2 text-2xl">
                  {rx.emoji}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {seated ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {emojis.map((e) => (
            <button
              key={e}
              type="button"
              className="btn btn-ghost !px-2 !py-1 !text-lg"
              disabled={busy}
              onClick={() => react(e)}
            >
              {e}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-ghost !py-1 !text-xs"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setSoundsMuted(next);
            }}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      ) : null}

      {!isTournament ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="field !w-28 !py-2"
            type="number"
            value={buyIn}
            onChange={(e) => setBuyIn(e.target.value)}
            title="Buy-in"
          />
          <button
            className="btn btn-ghost !py-2 !text-sm"
            disabled={busy}
            onClick={addBot}
            title="Admin only — AI stacks come from club float"
          >
            Add AI seat (admin)
          </button>
          {seated ? (
            <button className="btn btn-danger !py-2 !text-sm" disabled={busy} onClick={leave}>
              Leave table
            </button>
          ) : null}
        </div>
      ) : seated && !tournamentDone ? (
        <div className="mb-3">
          <button className="btn btn-danger !py-2 !text-sm" disabled={busy} onClick={leave}>
            Forfeit tournament
          </button>
        </div>
      ) : null}

      {view.actions?.length ? (
        <div className="mb-3 grid gap-3">
          {view.sizing ? (
            <div className="panel grid gap-2 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted)]">
                  {view.sizing.kind === "bet" ? "Bet size" : "Raise to"}
                </span>
                <span className="text-[var(--gold-strong)]">
                  {Number(raiseTo || view.sizing.min).toLocaleString()}
                </span>
              </div>
              <input
                className="w-full"
                type="range"
                min={view.sizing.min}
                max={view.sizing.max}
                step={Math.max(1, Math.floor(view.table.bb / 2))}
                value={Number(raiseTo || view.sizing.min)}
                onChange={(e) => setRaiseTo(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {view.sizing.presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn btn-ghost !py-1 !text-xs"
                    onClick={() => setRaiseTo(String(p))}
                  >
                    {p.toLocaleString()}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-gold"
                disabled={busy}
                onClick={() =>
                  act(view.sizing!.kind, Number(raiseTo || view.sizing!.min))
                }
              >
                {view.sizing.kind === "bet" ? "Bet" : "Raise to"}{" "}
                {Number(raiseTo || view.sizing.min).toLocaleString()}
              </button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {view.actions
              .filter((a) => !["bet", "raise"].includes(a.type))
              .map((a) => (
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
        </div>
      ) : (
        <p className="mb-3 text-sm text-[var(--muted)]">
          {isTournament
            ? tournamentDone
              ? "Head back to the lobby for the next event."
              : "Waiting for the next tournament hand…"
            : "Sit down and add an AI seat (or another player) to start a hand. Rake is taken from pots automatically."}
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
