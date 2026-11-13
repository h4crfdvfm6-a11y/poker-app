"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

type Overview = {
  club: { name: string; invite_code: string };
  members: number;
  openTables: number;
  activeTournaments: number;
  bbjp: {
    balance: string;
    enabled: boolean;
    trigger_hand: string;
    cycle_collections?: number;
    minimum_hand?: string;
  };
  totalRake: number;
};

type Member = {
  id: string;
  display_name: string;
  chip_balance: string | number;
  role: string;
};

type Table = {
  id: string;
  title: string;
  sb: string | number;
  bb: string | number;
  seats: number;
  rake_percent: string | number;
  rake_cap_bb: string | number;
  bbjp_enabled: boolean;
  status: string;
};

type Tournament = {
  id: string;
  title: string;
  buy_in: string | number;
  fee: string | number;
  starting_stack: number;
  max_players: number;
  entries: string | number;
  status: string;
  table_id?: string | null;
  prize_pool?: string | number;
  blind_level?: number;
};

type Bbjp = {
  balance: string;
  enabled: boolean;
  trigger_hand: string;
  cycle_collections: number;
  minimum_hand: string;
  topups: Array<{ id: string; amount: string; created_at: string }>;
};

function money(v: string | number) {
  return Number(v).toLocaleString();
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<"overview" | "players" | "tables" | "mtt" | "bbjp">(
    "overview",
  );
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [bbjp, setBbjp] = useState<Bbjp | null>(null);

  const [playerName, setPlayerName] = useState("");
  const [playerChips, setPlayerChips] = useState("5000");
  const [sendMemberId, setSendMemberId] = useState("");
  const [sendAmount, setSendAmount] = useState("1000");

  const [tableForm, setTableForm] = useState({
    title: "NLH 25/50",
    sb: "25",
    bb: "50",
    seats: "6",
    buyinMin: "2000",
    buyinMax: "10000",
    rakePercent: "5",
    rakeCapBb: "3",
    bbjpEnabled: true,
    isPrivate: false,
  });

  const [mttForm, setMttForm] = useState({
    title: "Tuesday League",
    buyIn: "1000",
    fee: "100",
    startingStack: "10000",
    maxPlayers: "9",
    blindMinutes: "5",
  });
  const [mttBusy, setMttBusy] = useState(false);

  const [bbjpAmount, setBbjpAmount] = useState("1000");

  const refresh = useCallback(async () => {
    const ov = await fetch("/api/admin/overview", { cache: "no-store" });
    if (ov.status === 401) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setOverview(await ov.json());
    const [m, t, mt, b] = await Promise.all([
      fetch("/api/admin/members").then((r) => r.json()),
      fetch("/api/admin/tables").then((r) => r.json()),
      fetch("/api/admin/tournaments").then((r) => r.json()),
      fetch("/api/admin/bbjp").then((r) => r.json()),
    ]);
    setMembers(m.members || []);
    setTables(t.tables || []);
    setTournaments(mt.tournaments || []);
    setBbjp(b);
    if (!sendMemberId && m.members?.[0]) setSendMemberId(m.members[0].id);
  }, [sendMemberId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Login failed");
      return;
    }
    await refresh();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }

  async function addPlayer(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: playerName,
        startingChips: Number(playerChips),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not add player");
      return;
    }
    setPlayerName("");
    await refresh();
  }

  async function sendChips(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/chips", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        memberId: sendMemberId,
        amount: Number(sendAmount),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not send chips");
      return;
    }
    await refresh();
  }

  async function openTable(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/tables", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: tableForm.title,
        sb: Number(tableForm.sb),
        bb: Number(tableForm.bb),
        seats: Number(tableForm.seats),
        buyinMin: Number(tableForm.buyinMin),
        buyinMax: Number(tableForm.buyinMax),
        rakePercent: Number(tableForm.rakePercent),
        rakeCapBb: Number(tableForm.rakeCapBb),
        bbjpEnabled: tableForm.bbjpEnabled,
        isPrivate: tableForm.isPrivate,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not open table");
      return;
    }
    setTab("tables");
    await refresh();
  }

  async function closeTable(id: string) {
    await fetch(`/api/admin/tables?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  async function createMtt(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/admin/tournaments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: mttForm.title,
        buyIn: Number(mttForm.buyIn),
        fee: Number(mttForm.fee),
        startingStack: Number(mttForm.startingStack),
        maxPlayers: Number(mttForm.maxPlayers),
        blindMinutes: Number(mttForm.blindMinutes),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not create tournament");
      return;
    }
    await refresh();
  }

  async function startMtt(id: string) {
    setMttBusy(true);
    setError("");
    const res = await fetch(`/api/admin/tournaments/${id}/start`, {
      method: "POST",
    });
    const json = await res.json();
    setMttBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not start tournament");
      return;
    }
    await refresh();
  }

  async function bbjpAction(action: string, extra: Record<string, unknown> = {}) {
    setError("");
    const res = await fetch("/api/admin/bbjp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "BBJP action failed");
      return;
    }
    setBbjp(json);
    await refresh();
  }

  if (authed === null) {
    return (
      <main className="mx-auto max-w-lg px-5 py-10 text-[var(--muted)]">
        Checking admin session…
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-10 pt-[max(28px,env(safe-area-inset-top))]">
        <Link href="/" className="brand mb-8 text-xl text-[var(--gold-strong)]">
          FA Poker
        </Link>
        <form onSubmit={login} className="panel p-5">
          <h1 className="brand mb-2 text-3xl">Admin</h1>
          <p className="mb-5 text-sm text-[var(--muted)]">
            Enter the club admin PIN to open tables, set rake, manage BBJP, and
            add players.
          </p>
          <label className="label">Admin PIN</label>
          <input
            className="field mb-4"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Admin PIN"
            required
          />
          {error ? <p className="mb-3 text-sm text-[#ffb4b6]">{error}</p> : null}
          <button className="btn btn-gold w-full" type="submit">
            Open admin panel
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-16 pt-[max(20px,env(safe-area-inset-top))]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="brand text-xl text-[var(--gold-strong)]">FA Poker Admin</div>
          <p className="text-sm text-[var(--muted)]">
            Invite {overview?.club.invite_code}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/lobby" className="btn btn-ghost !py-2 !text-sm">
            Lobby
          </Link>
          <button className="btn btn-ghost !py-2 !text-sm" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["overview", "Overview"],
            ["players", "Players"],
            ["tables", "Tables"],
            ["mtt", "MTTs"],
            ["bbjp", "BBJP"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`btn !py-2 !text-sm ${tab === key ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className="mb-3 text-sm text-[#ffb4b6]">{error}</p> : null}

      {tab === "overview" && overview ? (
        <section className="grid grid-cols-2 gap-3">
          {[
            ["Players", overview.members],
            ["Open tables", overview.openTables],
            ["Tournaments", overview.activeTournaments],
            ["Club rake", money(overview.totalRake)],
            ["BBJP", money(overview.bbjp.balance)],
            ["BBJP status", overview.bbjp.enabled ? "On" : "Off"],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel p-4">
              <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
                {label}
              </div>
              <div className="brand mt-1 text-2xl text-[var(--gold-strong)]">
                {value}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {tab === "players" ? (
        <section className="grid gap-4">
          <form onSubmit={addPlayer} className="panel grid gap-3 p-4">
            <h2 className="brand text-xl">Add player</h2>
            <div>
              <label className="label">Name</label>
              <input
                className="field"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Starting chips</label>
              <input
                className="field"
                type="number"
                value={playerChips}
                onChange={(e) => setPlayerChips(e.target.value)}
              />
            </div>
            <button className="btn btn-gold" type="submit">
              Add player
            </button>
          </form>

          <form onSubmit={sendChips} className="panel grid gap-3 p-4">
            <h2 className="brand text-xl">Send chips</h2>
            <div>
              <label className="label">Player</label>
              <select
                className="field"
                value={sendMemberId}
                onChange={(e) => setSendMemberId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} · {money(m.chip_balance)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Amount (+ send / − recall)</label>
              <input
                className="field"
                type="number"
                value={sendAmount}
                onChange={(e) => setSendAmount(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-gold" type="submit">
              Send / recall chips
            </button>
          </form>

          <div className="grid gap-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-[var(--line)] px-4 py-3"
              >
                <div>
                  <div className="font-semibold">{m.display_name}</div>
                  <div className="text-xs text-[var(--muted)]">{m.role}</div>
                </div>
                <div className="text-[var(--gold)]">{money(m.chip_balance)}</div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "tables" ? (
        <section className="grid gap-4">
          <form onSubmit={openTable} className="panel grid gap-3 p-4">
            <h2 className="brand text-xl">Open table</h2>
            <div>
              <label className="label">Title</label>
              <input
                className="field"
                value={tableForm.title}
                onChange={(e) =>
                  setTableForm((s) => ({ ...s, title: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">SB</label>
                <input
                  className="field"
                  type="number"
                  value={tableForm.sb}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, sb: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">BB</label>
                <input
                  className="field"
                  type="number"
                  value={tableForm.bb}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, bb: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Rake %</label>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  value={tableForm.rakePercent}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, rakePercent: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">Rake cap (BB)</label>
                <input
                  className="field"
                  type="number"
                  step="0.1"
                  value={tableForm.rakeCapBb}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, rakeCapBb: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Min buy-in</label>
                <input
                  className="field"
                  type="number"
                  value={tableForm.buyinMin}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, buyinMin: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">Max buy-in</label>
                <input
                  className="field"
                  type="number"
                  value={tableForm.buyinMax}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, buyinMax: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Seats</label>
                <input
                  className="field"
                  type="number"
                  value={tableForm.seats}
                  onChange={(e) =>
                    setTableForm((s) => ({ ...s, seats: e.target.value }))
                  }
                />
              </div>
              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tableForm.bbjpEnabled}
                  onChange={(e) =>
                    setTableForm((s) => ({
                      ...s,
                      bbjpEnabled: e.target.checked,
                    }))
                  }
                />
                BBJP on this table
              </label>
            </div>
            <button className="btn btn-gold" type="submit">
              Create table with rake
            </button>
          </form>

          <div className="grid gap-2">
            {tables.map((t) => (
              <div key={t.id} className="panel p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="font-semibold">{t.title}</div>
                  <span className="chip">{t.status}</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {money(t.sb)}/{money(t.bb)} · {t.seats}-max
                </p>
                <p className="text-sm text-[var(--gold)]">
                  Rake {Number(t.rake_percent)}% / {Number(t.rake_cap_bb)} BB
                  {t.bbjp_enabled ? " · BBJP" : ""}
                </p>
                {t.status === "open" ? (
                  <button
                    className="btn btn-danger mt-3 !py-2 !text-sm"
                    onClick={() => closeTable(t.id)}
                  >
                    Close table
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "mtt" ? (
        <section className="grid gap-4">
          <form onSubmit={createMtt} className="panel grid gap-3 p-4">
            <h2 className="brand text-xl">Create tournament</h2>
            <div>
              <label className="label">Title</label>
              <input
                className="field"
                value={mttForm.title}
                onChange={(e) =>
                  setMttForm((s) => ({ ...s, title: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Buy-in</label>
                <input
                  className="field"
                  type="number"
                  value={mttForm.buyIn}
                  onChange={(e) =>
                    setMttForm((s) => ({ ...s, buyIn: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="label">Fee</label>
                <input
                  className="field"
                  type="number"
                  value={mttForm.fee}
                  onChange={(e) =>
                    setMttForm((s) => ({ ...s, fee: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Starting stack</label>
                <input
                  className="field"
                  type="number"
                  value={mttForm.startingStack}
                  onChange={(e) =>
                    setMttForm((s) => ({
                      ...s,
                      startingStack: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="label">Max players</label>
                <input
                  className="field"
                  type="number"
                  value={mttForm.maxPlayers}
                  onChange={(e) =>
                    setMttForm((s) => ({ ...s, maxPlayers: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="label">Blind level (minutes)</label>
              <input
                className="field"
                type="number"
                value={mttForm.blindMinutes}
                onChange={(e) =>
                  setMttForm((s) => ({ ...s, blindMinutes: e.target.value }))
                }
              />
            </div>
            <button className="btn btn-gold" type="submit">
              Create tournament
            </button>
          </form>

          <div className="grid gap-2">
            {tournaments.map((t) => (
              <div key={t.id} className="panel p-4">
                <div className="mb-1 flex items-center justify-between">
                  <div className="font-semibold">{t.title}</div>
                  <span className="chip">{t.status}</span>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {money(t.buy_in)}+{money(t.fee)} · stack {money(t.starting_stack)}
                </p>
                <p className="text-sm text-[var(--gold)]">
                  {Number(t.entries)} / {t.max_players} entries
                  {t.status === "running" && t.prize_pool != null
                    ? ` · prize ${money(t.prize_pool)}`
                    : ""}
                </p>
                {t.status === "scheduled" ? (
                  <button
                    className="btn btn-gold mt-3 !py-2 !text-sm"
                    disabled={mttBusy || Number(t.entries) < 2}
                    onClick={() => startMtt(t.id)}
                  >
                    Start single table
                  </button>
                ) : null}
                {t.status === "running" && t.table_id ? (
                  <Link
                    href={`/table/${t.table_id}`}
                    className="btn btn-ghost mt-3 !py-2 !text-sm"
                  >
                    Open table
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "bbjp" && bbjp ? (
        <section className="grid gap-4">
          <div className="bbjp-panel p-4">
            <div className="bbjp-label text-xs uppercase tracking-wider">
              Jackpot pool
            </div>
            <div className="brand bbjp-amount text-4xl">
              {money(bbjp.balance)}
            </div>
            <p className="bbjp-meta mt-2 text-sm">
              {bbjp.enabled ? "Enabled" : "Disabled"} · minimum{" "}
              {bbjp.minimum_hand || bbjp.trigger_hand}
            </p>
            <p className="bbjp-meta mt-1 text-sm">
              Cycle collections {money(bbjp.cycle_collections ?? 0)} (ladder, not
              balance)
            </p>
            <div className="mt-4 flex gap-2">
              {bbjp.enabled ? (
                <button
                  className="btn btn-ghost"
                  onClick={() => bbjpAction("disable")}
                >
                  Turn off
                </button>
              ) : (
                <button
                  className="btn btn-gold"
                  onClick={() => bbjpAction("enable")}
                >
                  Turn on
                </button>
              )}
            </div>
          </div>

          <form
            className="panel grid gap-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void bbjpAction("topup", { amount: Number(bbjpAmount) });
            }}
          >
            <h2 className="brand text-xl">Top up BBJP</h2>
            <p className="text-sm text-[var(--muted)]">
              Minimum 100 chips. Top-ups raise the pool and the collections
              ladder. After an award the ladder resets toward AAAKK.
            </p>
            <input
              className="field"
              type="number"
              value={bbjpAmount}
              onChange={(e) => setBbjpAmount(e.target.value)}
            />
            <button className="btn btn-gold" type="submit">
              Top up jackpot
            </button>
          </form>

          <div className="panel p-4">
            <h2 className="brand mb-2 text-xl">Collections ladder</h2>
            <p className="mb-3 text-sm text-[var(--muted)]">
              Minimum losing hand follows jackpot-cycle collections (£50 bands).
              Current: {bbjp.minimum_hand || bbjp.trigger_hand}
            </p>
            <div className="grid gap-1 text-sm">
              {[
                ["0–50", "AAAKK"],
                ["51–100", "AAAQQ"],
                ["101–150", "AAAJJ"],
                ["151–200", "AAA1010"],
                ["201–250", "AAA99"],
                ["251–300", "AAA88"],
                ["…", "down to AAA22"],
              ].map(([band, hand]) => (
                <div
                  key={band}
                  className={`flex justify-between rounded-lg px-3 py-2 ${
                    hand === (bbjp.minimum_hand || bbjp.trigger_hand)
                      ? "bg-[rgba(93,202,134,0.2)]"
                      : "bg-black/15"
                  }`}
                >
                  <span className="text-[var(--muted)]">{band}</span>
                  <span className="font-semibold">{hand}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <h3 className="text-sm uppercase tracking-wider text-[var(--muted)]">
              Top-up history
            </h3>
            {bbjp.topups.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No top-ups yet.</p>
            ) : (
              bbjp.topups.map((t) => (
                <div
                  key={t.id}
                  className="flex justify-between rounded-xl border border-[var(--line)] px-4 py-3 text-sm"
                >
                  <span>+{money(t.amount)}</span>
                  <span className="text-[var(--muted)]">
                    {new Date(t.created_at).toLocaleString("en-GB", {
                      timeZone: "Europe/London",
                    })}{" "}
                    Europe/London
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </main>
  );
}
