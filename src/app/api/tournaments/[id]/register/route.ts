import {
  registerForTournament,
  unregisterFromTournament,
} from "@/lib/club";
import { getPlayerId } from "@/lib/session";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const playerId = await getPlayerId();
  if (!playerId) {
    return Response.json({ error: "Join the club lobby first" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: "register" | "unregister";
  };
  try {
    const tournament =
      body.action === "unregister"
        ? await unregisterFromTournament(id, playerId)
        : await registerForTournament(id, playerId);
    return Response.json({ tournament });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
