import { createTournament, listTournaments } from "@/lib/club";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/csrf";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ tournaments: await listTournaments() });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    buyIn?: number;
    fee?: number;
    startingStack?: number;
    maxPlayers?: number;
    blindMinutes?: number;
    startsAt?: string | null;
    kind?: "mtt" | "spin";
    gameType?: string;
  };
  try {
    const tournament = await createTournament({
      title: body.title || (body.kind === "spin" ? "Spin & Gold" : "Club MTT"),
      buyIn: Number(body.buyIn ?? 1000),
      fee: Number(body.fee ?? 100),
      startingStack: Number(body.startingStack ?? 10000),
      maxPlayers: Number(body.maxPlayers ?? 27),
      blindMinutes: Number(body.blindMinutes ?? 10),
      startsAt: body.startsAt ?? null,
      kind: body.kind === "spin" ? "spin" : "mtt",
      gameType: body.gameType || "NLH",
    });
    return Response.json({ tournament });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
