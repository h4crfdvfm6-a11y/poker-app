import { getBotFloat, topUpBotFloat } from "@/lib/club";
import { assertSameOrigin } from "@/lib/csrf";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ botFloat: await getBotFloat() });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as { amount?: number };
  try {
    await topUpBotFloat(Number(body.amount ?? 0));
    return Response.json({ botFloat: await getBotFloat() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
