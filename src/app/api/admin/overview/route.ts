import { getOverview } from "@/lib/club";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  return Response.json(await getOverview());
}
