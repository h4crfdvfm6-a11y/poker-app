import { DEFAULT_CLUB_ID, ensureClubSeeded, num, sendChips } from "./club";
import { sql } from "./db";
import { id } from "./ids";

export type ShopItem = {
  id: string;
  kind: string;
  title: string;
  description: string;
  gem_price: number;
  chip_amount: string | number;
  asset_key: string;
  sort_order: number;
  active: boolean;
};

const DEFAULTS: Array<{
  id: string;
  kind: string;
  title: string;
  description: string;
  gem_price: number;
  chip_amount: number;
  asset_key: string;
  sort_order: number;
}> = [
  {
    id: "pack_starter",
    kind: "chip_pack",
    title: "Starter Chips",
    description: "5,000 club chips",
    gem_price: 50,
    chip_amount: 5000,
    asset_key: "",
    sort_order: 10,
  },
  {
    id: "pack_plus",
    kind: "chip_pack",
    title: "Plus Chips",
    description: "25,000 club chips",
    gem_price: 200,
    chip_amount: 25000,
    asset_key: "",
    sort_order: 20,
  },
  {
    id: "pack_stack",
    kind: "chip_pack",
    title: "Big Stack",
    description: "100,000 club chips",
    gem_price: 650,
    chip_amount: 100000,
    asset_key: "",
    sort_order: 30,
  },
  {
    id: "avatar_fox",
    kind: "avatar",
    title: "Fox Avatar",
    description: "Cosmetic profile avatar",
    gem_price: 80,
    chip_amount: 0,
    asset_key: "avatar_fox",
    sort_order: 40,
  },
  {
    id: "avatar_owl",
    kind: "avatar",
    title: "Owl Avatar",
    description: "Cosmetic profile avatar",
    gem_price: 80,
    chip_amount: 0,
    asset_key: "avatar_owl",
    sort_order: 50,
  },
  {
    id: "avatar_crown",
    kind: "avatar",
    title: "Crown Avatar",
    description: "Premium profile avatar",
    gem_price: 150,
    chip_amount: 0,
    asset_key: "avatar_crown",
    sort_order: 60,
  },
  {
    id: "felt_midnight",
    kind: "felt",
    title: "Midnight Felt",
    description: "Deep blue table felt",
    gem_price: 120,
    chip_amount: 0,
    asset_key: "felt_midnight",
    sort_order: 70,
  },
  {
    id: "felt_ember",
    kind: "felt",
    title: "Ember Felt",
    description: "Warm ember table felt",
    gem_price: 120,
    chip_amount: 0,
    asset_key: "felt_ember",
    sort_order: 80,
  },
  {
    id: "felt_jade",
    kind: "felt",
    title: "Jade Felt",
    description: "Classic jade table felt",
    gem_price: 100,
    chip_amount: 0,
    asset_key: "felt_jade",
    sort_order: 90,
  },
  {
    id: "back_gold",
    kind: "card_back",
    title: "Gold Card Back",
    description: "Gold-trimmed card backs",
    gem_price: 90,
    chip_amount: 0,
    asset_key: "back_gold",
    sort_order: 100,
  },
  {
    id: "back_rose",
    kind: "card_back",
    title: "Rose Card Back",
    description: "Rose card backs",
    gem_price: 90,
    chip_amount: 0,
    asset_key: "back_rose",
    sort_order: 110,
  },
  {
    id: "react_fire",
    kind: "reaction_pack",
    title: "Fire Reactions",
    description: "Extra table reaction pack",
    gem_price: 60,
    chip_amount: 0,
    asset_key: "react_fire",
    sort_order: 120,
  },
];

async function ensureShopSchema() {
  await sql(
    `alter table members add column if not exists gem_balance integer not null default 0`,
  );
  await sql(
    `alter table members add column if not exists equipped_avatar text not null default 'avatar_default'`,
  );
  await sql(
    `alter table members add column if not exists equipped_felt text not null default 'felt_classic'`,
  );
  await sql(
    `alter table members add column if not exists equipped_card_back text not null default 'back_navy'`,
  );
  await sql(
    `create table if not exists shop_catalog (
       id text primary key,
       kind text not null,
       title text not null,
       description text not null default '',
       gem_price integer not null default 0,
       chip_amount numeric(14, 2) not null default 0,
       asset_key text not null default '',
       sort_order integer not null default 0,
       active boolean not null default true
     )`,
  );
  await sql(
    `create table if not exists member_inventory (
       member_id text not null references members(id),
       item_id text not null references shop_catalog(id),
       acquired_at timestamptz not null default now(),
       primary key (member_id, item_id)
     )`,
  );
  await sql(
    `create table if not exists shop_purchases (
       id text primary key,
       member_id text not null references members(id),
       item_id text not null,
       gems_spent integer not null default 0,
       chips_granted numeric(14, 2) not null default 0,
       created_at timestamptz not null default now()
     )`,
  );
  for (const item of DEFAULTS) {
    await sql(
      `insert into shop_catalog (
         id, kind, title, description, gem_price, chip_amount, asset_key, sort_order, active
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,true)
       on conflict (id) do nothing`,
      [
        item.id,
        item.kind,
        item.title,
        item.description,
        item.gem_price,
        item.chip_amount,
        item.asset_key,
        item.sort_order,
      ],
    );
  }
}

export async function listShopCatalog() {
  await ensureClubSeeded();
  await ensureShopSchema();
  return sql<ShopItem>(
    `select * from shop_catalog where active = true order by sort_order, title`,
  );
}

export async function getMemberCosmetics(memberId: string) {
  await ensureClubSeeded();
  await ensureShopSchema();
  const rows = await sql<{
    gem_balance: number;
    chip_balance: string | number;
    equipped_avatar: string;
    equipped_felt: string;
    equipped_card_back: string;
    display_name: string;
  }>(
    `select gem_balance, chip_balance, equipped_avatar, equipped_felt,
            equipped_card_back, display_name
     from members where id = $1`,
    [memberId],
  );
  if (!rows[0]) throw new Error("Player not found");
  const owned = await sql<{ item_id: string }>(
    `select item_id from member_inventory where member_id = $1`,
    [memberId],
  );
  return {
    ...rows[0],
    chip_balance: num(rows[0].chip_balance),
    owned: owned.map((o) => o.item_id),
  };
}

/** Admin / promo grant of premium gems (IAP later). */
export async function grantGems(memberId: string, amount: number, reason = "admin_gems") {
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Bad gem amount");
  await ensureClubSeeded();
  await ensureShopSchema();
  const updated = await sql(
    `update members set gem_balance = gem_balance + $1
     where id = $2 and gem_balance + $1 >= 0
     returning id, gem_balance`,
    [Math.trunc(amount), memberId],
  );
  if (!updated.length) throw new Error("Player not found or insufficient gems");
  await sql(
    `insert into chip_ledger (id, club_id, member_id, amount, reason, created_by)
     values ($1,$2,$3,$4,$5,'admin')`,
    [id("led"), DEFAULT_CLUB_ID, memberId, amount, reason],
  );
  return updated[0];
}

export async function purchaseShopItem(memberId: string, itemId: string) {
  await ensureClubSeeded();
  await ensureShopSchema();
  const [item] = await sql<ShopItem>(
    `select * from shop_catalog where id = $1 and active = true`,
    [itemId],
  );
  if (!item) throw new Error("Item not found");

  if (item.kind !== "chip_pack") {
    const have = await sql(
      `select 1 from member_inventory where member_id = $1 and item_id = $2`,
      [memberId, itemId],
    );
    if (have.length) throw new Error("Already owned");
  }

  const spent = await sql<{ gem_balance: number }>(
    `update members
     set gem_balance = gem_balance - $1
     where id = $2 and gem_balance >= $1
     returning gem_balance`,
    [item.gem_price, memberId],
  );
  if (!spent.length) throw new Error("Not enough gems");

  const chips = num(item.chip_amount);
  if (item.kind === "chip_pack" && chips > 0) {
    await sendChips(memberId, chips, `shop:${item.id}`);
  } else {
    await sql(
      `insert into member_inventory (member_id, item_id) values ($1,$2)
       on conflict do nothing`,
      [memberId, item.id],
    );
    // Auto-equip cosmetics on purchase
    if (item.kind === "avatar" && item.asset_key) {
      await sql(`update members set equipped_avatar = $1 where id = $2`, [
        item.asset_key,
        memberId,
      ]);
    }
    if (item.kind === "felt" && item.asset_key) {
      await sql(`update members set equipped_felt = $1 where id = $2`, [
        item.asset_key,
        memberId,
      ]);
    }
    if (item.kind === "card_back" && item.asset_key) {
      await sql(`update members set equipped_card_back = $1 where id = $2`, [
        item.asset_key,
        memberId,
      ]);
    }
  }

  await sql(
    `insert into shop_purchases (id, member_id, item_id, gems_spent, chips_granted)
     values ($1,$2,$3,$4,$5)`,
    [id("buy"), memberId, item.id, item.gem_price, chips],
  );

  return getMemberCosmetics(memberId);
}

export async function equipCosmetic(
  memberId: string,
  kind: "avatar" | "felt" | "card_back",
  assetKey: string,
) {
  await ensureClubSeeded();
  await ensureShopSchema();
  if (assetKey.endsWith("_default") || assetKey === "felt_classic" || assetKey === "back_navy") {
    // defaults always allowed
  } else {
    const owned = await sql(
      `select 1 from member_inventory mi
       join shop_catalog c on c.id = mi.item_id
       where mi.member_id = $1 and c.asset_key = $2 and c.kind = $3`,
      [memberId, assetKey, kind],
    );
    if (!owned.length) throw new Error("You do not own that cosmetic");
  }
  if (kind === "avatar") {
    await sql(`update members set equipped_avatar = $1 where id = $2`, [
      assetKey,
      memberId,
    ]);
  } else if (kind === "felt") {
    await sql(`update members set equipped_felt = $1 where id = $2`, [
      assetKey,
      memberId,
    ]);
  } else {
    await sql(`update members set equipped_card_back = $1 where id = $2`, [
      assetKey,
      memberId,
    ]);
  }
  return getMemberCosmetics(memberId);
}

export const FELT_STYLES: Record<string, string> = {
  felt_classic:
    "radial-gradient(circle at 50% 40%, #2f8a58 0%, #145834 55%, #0c3a24 100%)",
  felt_jade:
    "radial-gradient(circle at 50% 40%, #3aa87a 0%, #1a6b4a 55%, #0d3d2c 100%)",
  felt_midnight:
    "radial-gradient(circle at 50% 40%, #3a5a8a 0%, #1a2f55 55%, #0c1830 100%)",
  felt_ember:
    "radial-gradient(circle at 50% 40%, #a85a3a 0%, #6b2a1a 55%, #3d140c 100%)",
};

export const CARD_BACK_STYLES: Record<string, string> = {
  back_navy: "#1a1030",
  back_gold: "linear-gradient(145deg,#5c4818,#c9a227)",
  back_rose: "linear-gradient(145deg,#4a1830,#a23a5c)",
};

export const AVATAR_GLYPH: Record<string, string> = {
  avatar_default: "♠",
  avatar_fox: "🦊",
  avatar_owl: "🦉",
  avatar_crown: "👑",
};
