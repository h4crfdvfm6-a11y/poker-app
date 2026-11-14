/**
 * Reject cross-site state-changing requests that still carry cookies (e.g. form POST).
 * SameSite=Lax helps; Origin/Host matching closes the remaining CSRF gap.
 */

export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin navigations / some clients omit Origin; require a matching Host Referer or skip for same-site.
    const referer = request.headers.get("referer");
    if (!referer) return null;
    try {
      const ref = new URL(referer);
      const host = request.headers.get("host");
      if (host && ref.host === host) return null;
    } catch {
      /* fall through */
    }
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  try {
    const o = new URL(origin);
    const host = request.headers.get("host");
    if (!host || o.host !== host) {
      return Response.json({ error: "Invalid request origin" }, { status: 403 });
    }
  } catch {
    return Response.json({ error: "Invalid request origin" }, { status: 403 });
  }
  return null;
}
