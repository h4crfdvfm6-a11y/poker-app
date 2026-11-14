import { playerAction, playerOfcSet } from "@/lib/table-play";
import { getPlayerId } from "@/lib/session";
import type { ActionType } from "@/lib/poker/engine";
import type { OfcPlacement } from "@/lib/poker/ofc";
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
  const body = (await request.json().catch(() => ({}))) as {
    type?: ActionType | "ofc_set";
    amount?: number;
    placements?: OfcPlacement[];
    discardIndex?: number | null;
  };
  try {
    if (body.type === "ofc_set") {
      return Response.json(
        await playerOfcSet(
          id,
          playerId,
          body.placements || [],
          body.discardIndex ?? null,
        ),
      );
    }
    if (!body.type) {
      return Response.json({ error: "Action type required" }, { status: 400 });
    }
    return Response.json(
      await playerAction(id, playerId, body.type, Number(body.amount ?? 0)),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
