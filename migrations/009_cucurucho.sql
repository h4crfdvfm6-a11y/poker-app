alter table cash_tables
  add column if not exists cucurucho_enabled boolean not null default false;
alter table cash_tables
  add column if not exists cucurucho_ante_bb numeric(12,2) not null default 5;
alter table cash_tables
  add column if not exists cucurucho_every_hands int not null default 1;
