import { closeTable, createTable, listTables } from "@/lib/club";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/csrf";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ tables: await listTables() });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    gameType?: string;
    sb?: number;
    bb?: number;
    seats?: number;
    buyinMin?: number;
    buyinMax?: number;
    rakePercent?: number;
    rakeCapBb?: number;
    bbjpEnabled?: boolean;
    isPrivate?: boolean;
    squidEnabled?: boolean;
    squidTarget?: number;
    cucuruchoEnabled?: boolean;
    cucuruchoAnteBb?: number;
    cucuruchoEveryHands?: number;
  };
  try {
    const table = await createTable({
      title: body.title || "",
      gameType: body.gameType || "NLH",
      sb: Number(body.sb ?? 25),
      bb: Number(body.bb ?? 50),
      seats: Number(body.seats ?? 6),
      buyinMin: Number(body.buyinMin ?? 2000),
      buyinMax: Number(body.buyinMax ?? 10000),
      rakePercent: Number(body.rakePercent ?? 5),
      rakeCapBb: Number(body.rakeCapBb ?? 3),
      bbjpEnabled: Boolean(body.bbjpEnabled),
      isPrivate: Boolean(body.isPrivate),
      squidEnabled: Boolean(body.squidEnabled),
      squidTarget: Number(body.squidTarget ?? 3),
      cucuruchoEnabled: Boolean(body.cucuruchoEnabled),
      cucuruchoAnteBb: Number(body.cucuruchoAnteBb ?? 5),
      cucuruchoEveryHands: Number(body.cucuruchoEveryHands ?? 1),
    });
    return Response.json({ table });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const tableId = searchParams.get("id");
  if (!tableId) {
    return Response.json({ error: "id required" }, { status: 400 });
  }
  await closeTable(tableId);
  return Response.json({ ok: true });
}
