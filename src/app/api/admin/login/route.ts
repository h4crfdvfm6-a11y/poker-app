import { adminPinOk, setAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!body.pin || !adminPinOk(body.pin)) {
    return Response.json({ error: "Wrong admin PIN" }, { status: 401 });
  }
  await setAdminSession();
  return Response.json({ ok: true });
}
