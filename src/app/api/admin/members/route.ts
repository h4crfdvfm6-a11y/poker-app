import { addMember, listMembers } from "@/lib/club";
import { requireAdmin } from "@/lib/session";
import { assertSameOrigin } from "@/lib/csrf";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json({ members: await listMembers() });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json().catch(() => ({}))) as {
    displayName?: string;
    startingChips?: number;
  };
  if (!body.displayName?.trim()) {
    return Response.json({ error: "Name required" }, { status: 400 });
  }
  try {
    const member = await addMember(
      body.displayName,
      Number(body.startingChips ?? 5000),
    );
    return Response.json({ member });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
