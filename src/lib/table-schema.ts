import { sql } from "./db";
import { ensureOnce } from "./schema-once";

/** All cash-table / runtime columns needed for squid + hand economy. */
export async function ensureTablePlaySchema() {
  await ensureOnce("table-play-schema", async () => {
    await sql(
      `alter table table_runtime
       add column if not exists squid_json text not null default '{}'`,
    );
    await sql(
      `alter table table_runtime
       add column if not exists squid_hand_no int not null default 0`,
    );
    await sql(
      `alter table table_runtime
       add column if not exists squid_ante_hand_no int not null default 0`,
    );
    await sql(
      `alter table table_runtime
       add column if not exists economy_hand_no int not null default 0`,
    );
    await sql(
      `alter table cash_tables
       add column if not exists squid_enabled boolean not null default false`,
    );
    await sql(
      `alter table cash_tables
       add column if not exists squid_target int not null default 3`,
    );
  });
}
