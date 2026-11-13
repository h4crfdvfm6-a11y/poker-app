import {
  adminLoginBlocked,
  clearAdminLoginFailures,
  clientKey,
  recordAdminLoginFailure,
} from "@/lib/admin-login-limit";
import { adminPinConfigured, adminPinOk, setAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!adminPinConfigured()) {
    return Response.json(
      { error: "ADMIN_PIN is not configured on the server" },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  const blocked = adminLoginBlocked(key);
  if (blocked) {
    return Response.json(
      { error: "Too many failed attempts — try again later" },
      {
        status: 429,
        headers: { "Retry-After": String(blocked.retryAfterSec) },
      },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { pin?: string };
  if (!body.pin || !adminPinOk(body.pin)) {
    const result = recordAdminLoginFailure(key);
    if (result.locked) {
      return Response.json(
        { error: "Too many failed attempts — try again later" },
        {
          status: 429,
          headers: { "Retry-After": String(result.retryAfterSec) },
        },
      );
    }
    return Response.json({ error: "Wrong admin PIN" }, { status: 401 });
  }

  clearAdminLoginFailures(key);
  await setAdminSession();
  return Response.json({ ok: true });
}
