import { joinByInvite } from "@/lib/club";
import { setPlayerSession } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    inviteCode?: string;
    displayName?: string;
  };
  if (!body.inviteCode?.trim() || !body.displayName?.trim()) {
    return Response.json(
      { error: "Invite code and name required" },
      { status: 400 },
    );
  }
  try {
    const member = await joinByInvite(body.inviteCode, body.displayName);
    await setPlayerSession(member.id);
    return Response.json({ member });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
