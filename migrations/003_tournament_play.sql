alter table tournaments
  add column if not exists table_id text references cash_tables(id);

alter table tournaments
  add column if not exists blind_level int not null default 1;

alter table tournaments
  add column if not exists level_started_at timestamptz;

alter table tournaments
  add column if not exists prize_pool numeric(14, 2) not null default 0;

alter table tournaments
  add column if not exists winner_member_id text references members(id);

create index if not exists tournaments_table_idx on tournaments(table_id);
