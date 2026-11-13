import {
  adminLoginBlocked,
  clearAdminLoginFailures,
  recordAdminLoginFailure,
  withAdminLoginGate,
} from "@/lib/admin-login-limit";
import { assertSameOrigin } from "@/lib/csrf";
import { adminPinConfigured, adminPinOk, setAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  if (!adminPinConfigured()) {
    return Response.json(
      { error: "ADMIN_PIN is not configured on the server" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { pin?: string };

  return withAdminLoginGate(async () => {
    const blocked = await adminLoginBlocked();
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
      const result = await recordAdminLoginFailure();
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

    await clearAdminLoginFailures();
    await setAdminSession();
    return Response.json({ ok: true });
  });
}
