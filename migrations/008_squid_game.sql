-- ClubGG-style Squid side game on cash tables.
alter table cash_tables
  add column if not exists squid_enabled boolean not null default false;

alter table cash_tables
  add column if not exists squid_target int not null default 3;

alter table table_runtime
  add column if not exists squid_json text not null default '{}';

alter table table_runtime
  add column if not exists squid_hand_no int not null default 0;

alter table table_runtime
  add column if not exists squid_ante_hand_no int not null default 0;
