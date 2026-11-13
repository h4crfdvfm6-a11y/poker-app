import { getPlayerId, isAdmin } from "@/lib/session";
import { addBot } from "@/lib/table-play";
import { sql } from "@/lib/db";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const playerId = await getPlayerId();
  const admin = await isAdmin();
  if (!playerId && !admin) {
    return Response.json({ error: "Join the club first" }, { status: 401 });
  }

  if (playerId && !admin) {
    const seated = await sql(
      `select 1 from table_seats where table_id = $1 and member_id = $2`,
      [id, playerId],
    );
    if (!seated.length) {
      return Response.json(
        { error: "Sit at the table before adding AI seats" },
        { status: 403 },
      );
    }
  }

  const body = (await request.json().catch(() => ({}))) as { seat?: number };
  try {
    return Response.json(
      await addBot(id, body.seat != null ? Number(body.seat) : undefined),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
