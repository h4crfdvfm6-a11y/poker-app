import { closeTable, createTable, listTables } from "@/lib/club";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ tables: await listTables() });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    sb?: number;
    bb?: number;
    seats?: number;
    buyinMin?: number;
    buyinMax?: number;
    rakePercent?: number;
    rakeCapBb?: number;
    bbjpEnabled?: boolean;
    isPrivate?: boolean;
  };
  try {
    const table = await createTable({
      title: body.title || `NLH ${body.sb}/${body.bb}`,
      sb: Number(body.sb ?? 25),
      bb: Number(body.bb ?? 50),
      seats: Number(body.seats ?? 6),
      buyinMin: Number(body.buyinMin ?? 2000),
      buyinMax: Number(body.buyinMax ?? 10000),
      rakePercent: Number(body.rakePercent ?? 5),
      rakeCapBb: Number(body.rakeCapBb ?? 3),
      bbjpEnabled: Boolean(body.bbjpEnabled),
      isPrivate: Boolean(body.isPrivate),
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
