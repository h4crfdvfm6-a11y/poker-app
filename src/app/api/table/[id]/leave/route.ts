import { leaveTable } from "@/lib/table-play";
import { getPlayerId } from "@/lib/session";
import { assertSameOrigin } from "@/lib/csrf";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
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
