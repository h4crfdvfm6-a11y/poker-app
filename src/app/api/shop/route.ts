import { assertSameOrigin } from "@/lib/csrf";
import {
  equipCosmetic,
  getMemberCosmetics,
  listShopCatalog,
  purchaseShopItem,
} from "@/lib/shop";
import { getPlayerId } from "@/lib/session";

export async function GET() {
  const playerId = await getPlayerId();
  const catalog = await listShopCatalog();
  const me = playerId ? await getMemberCosmetics(playerId) : null;
  return Response.json({
    catalog,
    me,
    note: "Gems buy chips and cosmetics. Nothing is redeemable for real money.",
  });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;
  const playerId = await getPlayerId();
  if (!playerId) {
    return Response.json({ error: "Join the club first" }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    action?: "buy" | "equip";
    itemId?: string;
    kind?: "avatar" | "felt" | "card_back";
    assetKey?: string;
  };
  try {
    if (body.action === "equip" && body.kind && body.assetKey) {
      const me = await equipCosmetic(playerId, body.kind, body.assetKey);
      return Response.json({ me });
    }
    if (!body.itemId) {
      return Response.json({ error: "itemId required" }, { status: 400 });
    }
    const me = await purchaseShopItem(playerId, body.itemId);
    return Response.json({ me });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
