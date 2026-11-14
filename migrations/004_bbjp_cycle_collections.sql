-- Jackpot-cycle BBJP collections drive the minimum-losing-hand ladder (CSS-style).
alter table bbjp_settings
  add column if not exists cycle_collections numeric(14, 2) not null default 0;

-- Align stored trigger with empty-cycle ladder default.
update bbjp_settings
set trigger_hand = 'AAAKK'
where cycle_collections = 0;
