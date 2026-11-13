import { adminPinConfigured, adminPinOk, setAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!adminPinConfigured()) {
    return Response.json(
      { error: "ADMIN_PIN is not configured on the server" },
      { status: 503 },
    );
  }
  const body = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!body.pin || !adminPinOk(body.pin)) {
    return Response.json({ error: "Wrong admin PIN" }, { status: 401 });
  }
  await setAdminSession();
  return Response.json({ ok: true });
}
