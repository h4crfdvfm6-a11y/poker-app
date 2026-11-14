import { requireAdmin } from "@/lib/session";
import { startTournament } from "@/lib/tournament";
import { assertSameOrigin } from "@/lib/csrf";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await context.params;
  try {
    const tournament = await startTournament(id);
    return Response.json({ tournament });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
