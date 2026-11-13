-- Club bankroll that funds AI table stacks (never player cashouts).
alter table club_rake
  add column if not exists bot_float numeric(14, 2) not null default 0;

-- Seed a working AI float so 6-max tables can fill without minting chips.
update club_rake
set bot_float = greatest(bot_float, 250000)
where club_id = 'club_fa_poker';

-- Shared across instances (admin PIN + invite guess throttles).
create table if not exists security_throttle (
  key text primary key,
  failures integer not null default 0,
  window_started timestamptz not null default now(),
  locked_until timestamptz
);
