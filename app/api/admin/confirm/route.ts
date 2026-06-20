import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pendingMatches, productConfirmations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const confirmSchema = z.object({
  pendingMatchId: z.number().int(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pending = await db.query.pendingMatches.findFirst({
    where: eq(pendingMatches.id, parsed.data.pendingMatchId),
  });
  if (!pending) {
    return NextResponse.json({ error: "Pending match not found" }, { status: 404 });
  }

  await db
    .insert(productConfirmations)
    .values({
      productId: pending.productId,
      canonicalTitle: pending.canonicalTitle,
      canonicalUpc: pending.canonicalUpc,
      imageUrl: pending.imageUrl,
    })
    .onConflictDoUpdate({
      target: productConfirmations.productId,
      set: {
        canonicalTitle: pending.canonicalTitle,
        canonicalUpc: pending.canonicalUpc,
        imageUrl: pending.imageUrl,
      },
    });

  await db.update(pendingMatches).set({ resolved: true }).where(eq(pendingMatches.id, pending.id));

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId) {
    const all = await db.query.pendingMatches.findMany({ where: eq(pendingMatches.resolved, false) });
    return NextResponse.json(all);
  }
  const pending = await db.query.pendingMatches.findMany({
    where: eq(pendingMatches.productId, Number(productId)),
  });
  return NextResponse.json(pending);
}
