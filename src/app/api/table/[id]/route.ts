import { getTableView } from "@/lib/table-play";
import { getPlayerId } from "@/lib/session";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const playerId = await getPlayerId();
    return Response.json(await getTableView(id, playerId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
