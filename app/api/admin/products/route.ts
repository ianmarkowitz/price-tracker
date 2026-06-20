import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pendingMatches, products } from "@/lib/db/schema";
import { discoverProduct } from "@/lib/discovery";
import { filterOffersForProduct } from "@/lib/matching";
import { eq } from "drizzle-orm";

const createProductSchema = z.object({
  name: z.string().min(1),
  searchTerm: z.string().min(1),
  mustInclude: z.array(z.string()).default([]),
  mustExclude: z.array(z.string()).default([]),
  upc: z.string().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  checkIntervalHours: z.number().int().positive().default(6),
  alertWindowDays: z.number().int().positive().default(90),
  alertMarginPct: z.number().positive().default(3),
  alertCooldownHours: z.number().int().positive().default(24),
});

export async function GET() {
  const all = await db.query.products.findMany();
  const confirmations = await db.query.productConfirmations.findMany();
  const confirmedIds = new Set(confirmations.map((c) => c.productId));
  return NextResponse.json(
    all.map((p) => ({ ...p, confirmed: confirmedIds.has(p.id) }))
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const [product] = await db.insert(products).values(input).returning();

  // Run discovery immediately so the human can confirm the match.
  const result = await discoverProduct(product.searchTerm);
  if (!result) {
    return NextResponse.json({
      product,
      pendingMatch: null,
      message: "No discovery results found. You can retry later via the admin UI.",
    });
  }

  const filtered = filterOffersForProduct(result.offers, product, result.canonicalUpc ?? null);

  const [pending] = await db
    .insert(pendingMatches)
    .values({
      productId: product.id,
      canonicalTitle: result.canonicalTitle,
      canonicalUpc: result.canonicalUpc,
      imageUrl: result.imageUrl,
      offers: filtered.map((o) => ({
        seller: o.seller,
        link: o.link,
        listedPrice: o.listedPrice,
        shipping: o.shipping,
        inStock: o.inStock,
        upc: o.upc,
      })),
    })
    .returning();

  return NextResponse.json({ product, pendingMatch: pending });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await db.delete(products).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}
