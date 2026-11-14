-- Soft premium currency + cosmetics. Never redeemable for real money.
alter table members
  add column if not exists gem_balance integer not null default 0;

alter table members
  add column if not exists equipped_avatar text not null default 'avatar_default';

alter table members
  add column if not exists equipped_felt text not null default 'felt_classic';

alter table members
  add column if not exists equipped_card_back text not null default 'back_navy';

create table if not exists shop_catalog (
  id text primary key,
  kind text not null, -- chip_pack | avatar | felt | card_back | reaction_pack
  title text not null,
  description text not null default '',
  gem_price integer not null default 0,
  chip_amount numeric(14, 2) not null default 0,
  asset_key text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true
);

create table if not exists member_inventory (
  member_id text not null references members(id),
  item_id text not null references shop_catalog(id),
  acquired_at timestamptz not null default now(),
  primary key (member_id, item_id)
);

create table if not exists shop_purchases (
  id text primary key,
  member_id text not null references members(id),
  item_id text not null,
  gems_spent integer not null default 0,
  chips_granted numeric(14, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- Seed catalog (idempotent).
insert into shop_catalog (id, kind, title, description, gem_price, chip_amount, asset_key, sort_order)
values
  ('pack_starter', 'chip_pack', 'Starter Chips', '5,000 club chips', 50, 5000, '', 10),
  ('pack_plus', 'chip_pack', 'Plus Chips', '25,000 club chips', 200, 25000, '', 20),
  ('pack_stack', 'chip_pack', 'Big Stack', '100,000 club chips', 650, 100000, '', 30),
  ('avatar_fox', 'avatar', 'Fox Avatar', 'Cosmetic profile avatar', 80, 0, 'avatar_fox', 40),
  ('avatar_owl', 'avatar', 'Owl Avatar', 'Cosmetic profile avatar', 80, 0, 'avatar_owl', 50),
  ('avatar_crown', 'avatar', 'Crown Avatar', 'Premium profile avatar', 150, 0, 'avatar_crown', 60),
  ('felt_midnight', 'felt', 'Midnight Felt', 'Deep blue table felt', 120, 0, 'felt_midnight', 70),
  ('felt_ember', 'felt', 'Ember Felt', 'Warm ember table felt', 120, 0, 'felt_ember', 80),
  ('felt_jade', 'felt', 'Jade Felt', 'Classic jade table felt', 100, 0, 'felt_jade', 90),
  ('back_gold', 'card_back', 'Gold Card Back', 'Gold-trimmed card backs', 90, 0, 'back_gold', 100),
  ('back_rose', 'card_back', 'Rose Card Back', 'Rose card backs', 90, 0, 'back_rose', 110),
  ('react_fire', 'reaction_pack', 'Fire Reactions', 'Extra table reaction pack', 60, 0, 'react_fire', 120)
on conflict (id) do nothing;
