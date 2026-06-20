import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { priceHistory } from "@/lib/db/schema";

// Test helper: insert a fake historical price_history row for a product so
// you can exercise the alert rule without waiting for a real price drop.
// Not linked to any real cron run; isBest defaults to true so it counts
// toward trailing-low / prior-reading calculations.
const seedSchema = z.object({
  productId: z.number().int(),
  seller: z.string().default("Test Seller"),
  link: z.string().default("https://example.com"),
  listedPrice: z.number(),
  shipping: z.number().default(0),
  rewardsPoints: z.number().default(0),
  pointValueUsd: z.number().default(0.01),
  inStock: z.boolean().default(true),
  daysAgo: z.number().default(0),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = seedSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const rewardsValue = input.rewardsPoints * input.pointValueUsd;
  const effectivePrice = input.listedPrice + input.shipping - rewardsValue;
  const checkedAt = new Date(Date.now() - input.daysAgo * 24 * 60 * 60 * 1000);

  const [row] = await db
    .insert(priceHistory)
    .values({
      productId: input.productId,
      seller: input.seller,
      link: input.link,
      listedPrice: input.listedPrice,
      shipping: input.shipping,
      rewardsPoints: input.rewardsPoints,
      pointValueUsd: input.pointValueUsd,
      rewardsValue,
      effectivePrice,
      inStock: input.inStock,
      isBest: true,
      checkedAt,
    })
    .returning();

  return NextResponse.json(row);
}
