"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type LobbyData = {
  club: { name: string; invite_code: string };
  tables: Array<{
    id: string;
    title: string;
    sb: string | number;
    bb: string | number;
    seats: number;
    rake_percent: string | number;
    rake_cap_bb: string | number;
    bbjp_enabled: boolean;
    buyin_min: string | number;
    buyin_max: string | number;
  }>;
  tournaments: Array<{
    id: string;
    title: string;
    buy_in: string | number;
    fee: string | number;
    starting_stack: number;
    max_players: number;
    entries: string | number;
    status: string;
  }>;
  bbjp: { balance: string | number; enabled: boolean; trigger_hand: string };
  me: { id: string; display_name: string; chip_balance: string | number } | null;
};

function money(v: string | number) {
  return Number(v).toLocaleString();
}

export default function LobbyPage() {
  const [data, setData] = useState<LobbyData | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("FAPOKER");

  const load = useCallback(async () => {
    const res = await fetch("/api/lobby", { cache: "no-store" });
    const json = await res.json();
    setData(json);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function join(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ inviteCode: invite, displayName: name }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not join");
      return;
    }
    await load();
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-[var(--muted)]">
        Loading club lobby…
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <Link href="/" className="brand text-xl text-[var(--gold-strong)]">
            FA Poker
          </Link>
          <p className="mt-1 text-sm text-[var(--muted)]">{data.club.name}</p>
        </div>
        <Link href="/admin" className="btn btn-ghost !py-2 !text-sm">
          Admin
        </Link>
      </div>

      <div className="panel mb-4 flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Bad Beat Jackpot
          </div>
          <div className="brand text-2xl text-[var(--gold-strong)]">
            {money(data.bbjp.balance)}
          </div>
        </div>
        <div className="text-right text-xs text-[var(--muted)]">
          <div>{data.bbjp.enabled ? "Live" : "Off"}</div>
          <div>Trigger {data.bbjp.trigger_hand}</div>
        </div>
      </div>

      {data.me ? (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3">
          <div>
            <div className="font-semibold">{data.me.display_name}</div>
            <div className="text-sm text-[var(--muted)]">Club chips</div>
          </div>
          <div className="brand text-xl text-[var(--gold)]">
            {money(data.me.chip_balance)}
          </div>
        </div>
      ) : (
        <form onSubmit={join} className="panel mb-5 grid gap-3 p-4">
          <div>
            <label className="label">Your name</label>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Player name"
              required
            />
          </div>
          <div>
            <label className="label">Club invite</label>
            <input
              className="field"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="FAPOKER"
              required
            />
          </div>
          {error ? <p className="text-sm text-[#ffb4b6]">{error}</p> : null}
          <button className="btn btn-gold" type="submit">
            Join club · get 5,000 chips
          </button>
        </form>
      )}

      <section className="mb-6">
        <h2 className="brand mb-3 text-2xl">Open tables</h2>
        <div className="grid gap-3">
          {data.tables.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No open tables yet. Admin can open one from the panel.
            </p>
          ) : (
            data.tables.map((t) => (
              <article key={t.id} className="panel p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.title}</h3>
                  <span className="chip">{t.seats}-max</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Blinds {money(t.sb)}/{money(t.bb)} · Buy-in {money(t.buyin_min)}–
                  {money(t.buyin_max)}
                </p>
                <p className="mt-1 text-sm text-[var(--gold)]">
                  Rake {Number(t.rake_percent)}% / cap {Number(t.rake_cap_bb)} BB
                  {t.bbjp_enabled ? " · BBJP on" : ""}
                </p>
                <Link
                  href={`/table/${t.id}`}
                  className="btn btn-gold mt-3 !py-2 !text-sm"
                >
                  Join table
                </Link>
              </article>
            ))
          )}
        </div>
      </section>

      <section>
        <h2 className="brand mb-3 text-2xl">Tournaments</h2>
        <div className="grid gap-3">
          {data.tournaments.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No scheduled tournaments.</p>
          ) : (
            data.tournaments.map((t) => (
              <article key={t.id} className="panel p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h3 className="font-semibold">{t.title}</h3>
                  <span className="chip">{t.status}</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  Buy-in {money(t.buy_in)} + {money(t.fee)} · Stack{" "}
                  {money(t.starting_stack)}
                </p>
                <p className="mt-1 text-sm text-[var(--gold)]">
                  {Number(t.entries)} / {t.max_players} registered
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
