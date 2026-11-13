import { addBot } from "@/lib/table-play";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
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
