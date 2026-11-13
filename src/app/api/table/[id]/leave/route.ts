import { leaveTable } from "@/lib/table-play";
import { getPlayerId } from "@/lib/session";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const playerId = await getPlayerId();
  if (!playerId) {
    return Response.json({ error: "Not logged in" }, { status: 401 });
  }
  try {
    return Response.json(await leaveTable(id, playerId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
