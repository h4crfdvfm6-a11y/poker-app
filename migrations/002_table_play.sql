create table if not exists table_seats (
  table_id text not null references cash_tables(id),
  seat_no int not null,
  member_id text references members(id),
  display_name text not null default '',
  stack numeric(14, 2) not null default 0,
  is_bot boolean not null default false,
  sitting_out boolean not null default false,
  primary key (table_id, seat_no)
);

create table if not exists table_runtime (
  table_id text primary key references cash_tables(id),
  hand_no int not null default 0,
  button_seat int not null default 0,
  version int not null default 0,
  phase text not null default 'waiting',
  state_json text not null default '{}',
  updated_at timestamptz not null default now()
);
