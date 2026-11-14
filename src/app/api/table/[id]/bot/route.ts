import { assertSameOrigin } from "@/lib/csrf";
import { isAdmin } from "@/lib/session";
import { addBot } from "@/lib/table-play";

/** AI seats are admin-controlled and funded from the club bot float. */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const { id } = await ctx.params;
  if (!(await isAdmin())) {
    return Response.json(
      { error: "Only club admin can seat AI players" },
      { status: 403 },
    );
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
