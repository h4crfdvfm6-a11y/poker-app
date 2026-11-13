import {
  adminLoginBlocked,
  clearAdminLoginFailures,
  recordAdminLoginFailure,
  withAdminLoginGate,
} from "@/lib/admin-login-limit";
import { adminPinConfigured, adminPinOk, setAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  if (!adminPinConfigured()) {
    return Response.json(
      { error: "ADMIN_PIN is not configured on the server" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { pin?: string };

  return withAdminLoginGate(async () => {
    const blocked = adminLoginBlocked();
    if (blocked) {
      return Response.json(
        { error: "Too many failed attempts — try again later" },
        {
          status: 429,
          headers: { "Retry-After": String(blocked.retryAfterSec) },
        },
      );
    }

    if (!body.pin || !adminPinOk(body.pin)) {
      const result = recordAdminLoginFailure();
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

    clearAdminLoginFailures();
    await setAdminSession();
    return Response.json({ ok: true });
  });
}
