import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { sellerSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const upsertSchema = z.object({
  seller: z.string().min(1),
  pointValueUsd: z.number().nonnegative().default(0.01),
  pointsPerDollar: z.number().nonnegative().default(0),
});

export async function GET() {
  const all = await db.query.sellerSettings.findMany();
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  await db
    .insert(sellerSettings)
    .values(input)
    .onConflictDoUpdate({
      target: sellerSettings.seller,
      set: { pointValueUsd: input.pointValueUsd, pointsPerDollar: input.pointsPerDollar },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { seller } = await req.json();
  await db.delete(sellerSettings).where(eq(sellerSettings.seller, seller));
  return NextResponse.json({ ok: true });
}
