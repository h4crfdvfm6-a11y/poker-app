import { getBbjp, setBbjpEnabled, setBbjpTrigger, topUpBbjp } from "@/lib/club";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/csrf";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json(await getBbjp());
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    action?: "topup" | "enable" | "disable" | "trigger";
    amount?: number;
    triggerHand?: string;
  };
  try {
    if (body.action === "topup") {
      return Response.json(await topUpBbjp(Number(body.amount)));
    }
    if (body.action === "enable") {
      return Response.json(await setBbjpEnabled(true));
    }
    if (body.action === "disable") {
      return Response.json(await setBbjpEnabled(false));
    }
    if (body.action === "trigger" && body.triggerHand) {
      return Response.json(await setBbjpTrigger(body.triggerHand));
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
