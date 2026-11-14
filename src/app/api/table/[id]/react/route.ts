import { assertSameOrigin } from "@/lib/csrf";
import { freeEmojis, listReactions, postReaction } from "@/lib/reactions";
import { getPlayerId } from "@/lib/session";
import { sql } from "@/lib/db";
import { getMemberCosmetics } from "@/lib/shop";

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return Response.json({
    reactions: listReactions(id),
    emojis: freeEmojis(),
  });
}

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
  const body = (await request.json().catch(() => ({}))) as { emoji?: string };
  if (!body.emoji) {
    return Response.json({ error: "emoji required" }, { status: 400 });
  }
  const seated = await sql<{ seat_no: number; display_name: string }>(
    `select seat_no, display_name from table_seats
     where table_id = $1 and member_id = $2`,
    [id, playerId],
  );
  if (!seated.length) {
    return Response.json({ error: "Sit first" }, { status: 403 });
  }
  let allowFire = false;
  try {
    const cos = await getMemberCosmetics(playerId);
    allowFire = cos.owned.includes("react_fire");
  } catch {
    allowFire = false;
  }
  try {
    const reaction = postReaction({
      tableId: id,
      memberId: playerId,
      seat: seated[0]!.seat_no,
      name: seated[0]!.display_name,
      emoji: body.emoji,
      allowFirePack: allowFire,
    });
    return Response.json({
      reaction,
      reactions: listReactions(id),
      emojis: allowFire ? [...freeEmojis(), "💥", "🚀", "🫠", "👀"] : freeEmojis(),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
