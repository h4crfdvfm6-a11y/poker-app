import {
  getBbjp,
  getOverview,
  listMyTournamentIds,
  listPublicTables,
  listTournaments,
} from "@/lib/club";
import { getPlayerId } from "@/lib/session";
import { sql } from "@/lib/db";

export async function GET() {
  const overview = await getOverview();
  const tables = (await listPublicTables()).filter((t) => t.status === "open");
  const tournaments = (await listTournaments()).filter((t) =>
    ["scheduled", "running"].includes(t.status),
  );
  const bbjp = await getBbjp();
  const playerId = await getPlayerId();
  let me = null;
  let myTournamentIds: string[] = [];
  if (playerId) {
    const rows = await sql(
      "select id, display_name, chip_balance, role from members where id = $1",
      [playerId],
    );
    me = rows[0] ?? null;
    myTournamentIds = await listMyTournamentIds(playerId);
  }
  return Response.json({
    club: {
      name: overview.club.name,
      // Invite is typed by the player — do not publish it on the anonymous lobby.
    },
    tables,
    tournaments,
    bbjp: {
      balance: bbjp.balance,
      enabled: bbjp.enabled,
      trigger_hand: bbjp.trigger_hand,
    },
    me,
    myTournamentIds,
  });
}
