"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Item = {
  id: string;
  kind: string;
  title: string;
  description: string;
  gem_price: number;
  chip_amount: number | string;
  asset_key: string;
};

type Me = {
  gem_balance: number;
  chip_balance: number;
  equipped_avatar: string;
  equipped_felt: string;
  equipped_card_back: string;
  display_name: string;
  owned: string[];
};

const KIND_LABEL: Record<string, string> = {
  chip_pack: "Chip packs",
  avatar: "Avatars",
  felt: "Table skins",
  card_back: "Card backs",
  reaction_pack: "Reactions",
};

export default function ShopPage() {
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/shop", { cache: "no-store" });
    const json = await res.json();
    setCatalog(json.catalog || []);
    setMe(json.me);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function buy(itemId: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "buy", itemId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Purchase failed");
      return;
    }
    setMe(json.me);
  }

  async function equip(kind: "avatar" | "felt" | "card_back", assetKey: string) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/shop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "equip", kind, assetKey }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not equip");
      return;
    }
    setMe(json.me);
  }

  const groups = Object.keys(KIND_LABEL);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-5 pb-12 pt-[max(20px,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <Link href="/lobby" className="brand text-xl text-[var(--gold-strong)]">
            Shop
          </Link>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Chips, skins & cosmetics — play money only, never cash-out.
          </p>
        </div>
        <Link href="/lobby" className="btn btn-ghost !py-2 !text-sm">
          Lobby
        </Link>
      </div>

      {me ? (
        <div className="panel mb-5 grid grid-cols-2 gap-3 p-4">
          <div>
            <div className="text-xs text-[var(--muted)]">Gems</div>
            <div className="brand text-2xl text-[var(--gold-strong)]">
              {me.gem_balance}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--muted)]">Club chips</div>
            <div className="brand text-2xl text-[var(--gold)]">
              {Number(me.chip_balance).toLocaleString()}
            </div>
          </div>
        </div>
      ) : (
        <p className="mb-5 text-sm text-[var(--muted)]">
          Join the club lobby first to buy and equip items.
        </p>
      )}

      {error ? <p className="mb-3 text-sm text-[#ffb4b6]">{error}</p> : null}

      {groups.map((kind) => {
        const items = catalog.filter((i) => i.kind === kind);
        if (!items.length) return null;
        return (
          <section key={kind} className="mb-6">
            <h2 className="brand mb-3 text-xl">{KIND_LABEL[kind]}</h2>
            <div className="grid gap-3">
              {items.map((item) => {
                const owned = me?.owned?.includes(item.id);
                const equipped =
                  (kind === "avatar" && me?.equipped_avatar === item.asset_key) ||
                  (kind === "felt" && me?.equipped_felt === item.asset_key) ||
                  (kind === "card_back" &&
                    me?.equipped_card_back === item.asset_key);
                return (
                  <article key={item.id} className="panel p-4">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{item.title}</div>
                        <p className="text-sm text-[var(--muted)]">
                          {item.description}
                        </p>
                      </div>
                      <span className="chip">{item.gem_price} gems</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {kind === "chip_pack" || !owned ? (
                        <button
                          className="btn btn-gold !py-2 !text-sm"
                          disabled={busy || !me}
                          onClick={() => buy(item.id)}
                        >
                          Buy
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost !py-2 !text-sm"
                          disabled={busy || equipped}
                          onClick={() =>
                            equip(
                              kind as "avatar" | "felt" | "card_back",
                              item.asset_key,
                            )
                          }
                        >
                          {equipped ? "Equipped" : "Equip"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}
