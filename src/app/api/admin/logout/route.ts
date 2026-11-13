import { assertSameOrigin } from "@/lib/csrf";
import { clearAdminSession } from "@/lib/session";

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  await clearAdminSession();
  return Response.json({ ok: true });
}
