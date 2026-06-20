import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }
  const rows = await db.query.priceHistory.findMany({
    where: eq(priceHistory.productId, Number(productId)),
    orderBy: [desc(priceHistory.checkedAt)],
    limit: 500,
  });
  return NextResponse.json(rows);
}
