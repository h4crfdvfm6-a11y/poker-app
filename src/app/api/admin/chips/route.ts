import { sendChips } from "@/lib/club";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/csrf";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    memberId?: string;
    amount?: number;
    reason?: string;
  };
  if (!body.memberId || body.amount == null) {
    return Response.json({ error: "memberId and amount required" }, { status: 400 });
  }
  try {
    const member = await sendChips(
      body.memberId,
      Number(body.amount),
      body.reason || "admin_send",
    );
    return Response.json({ member });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
