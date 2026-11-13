alter table tournaments
  add column if not exists kind text not null default 'mtt';

alter table tournaments
  add column if not exists spin_multiplier numeric(10, 2);

alter table tournaments
  add column if not exists game_type text not null default 'NLH';
