import { sitAtTable } from "@/lib/table-play";
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
    return Response.json({ error: "Join the club lobby first" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    seat?: number;
    buyIn?: number;
  };
  try {
    const view = await sitAtTable(
      id,
      playerId,
      Number(body.seat ?? 0),
      Number(body.buyIn ?? 0),
    );
    return Response.json(view);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
