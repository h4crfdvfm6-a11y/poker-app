create table if not exists clubs (
  id text primary key,
  name text not null,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists members (
  id text primary key,
  club_id text not null references clubs(id),
  display_name text not null,
  role text not null default 'player',
  chip_balance numeric(14, 2) not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists members_club_idx on members(club_id);

create table if not exists chip_ledger (
  id text primary key,
  club_id text not null references clubs(id),
  member_id text not null references members(id),
  amount numeric(14, 2) not null,
  reason text not null,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists cash_tables (
  id text primary key,
  club_id text not null references clubs(id),
  title text not null,
  game_type text not null default 'NLH',
  format text not null default 'ring',
  sb numeric(14, 2) not null,
  bb numeric(14, 2) not null,
  seats int not null default 6,
  buyin_min numeric(14, 2) not null,
  buyin_max numeric(14, 2) not null,
  rake_percent numeric(6, 2) not null default 5,
  rake_cap_bb numeric(8, 2) not null default 3,
  bbjp_enabled boolean not null default false,
  is_private boolean not null default false,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table if not exists tournaments (
  id text primary key,
  club_id text not null references clubs(id),
  title text not null,
  buy_in numeric(14, 2) not null,
  fee numeric(14, 2) not null default 0,
  starting_stack int not null default 10000,
  max_players int not null default 27,
  blind_minutes int not null default 10,
  status text not null default 'scheduled',
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists tournament_entries (
  tournament_id text not null references tournaments(id),
  member_id text not null references members(id),
  registered_at timestamptz not null default now(),
  primary key (tournament_id, member_id)
);

create table if not exists bbjp_settings (
  club_id text primary key references clubs(id),
  balance numeric(14, 2) not null default 0,
  enabled boolean not null default false,
  trigger_hand text not null default 'AAAJJ',
  updated_at timestamptz not null default now()
);

create table if not exists bbjp_topups (
  id text primary key,
  club_id text not null references clubs(id),
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create table if not exists club_rake (
  club_id text primary key references clubs(id),
  total_rake numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now()
);
