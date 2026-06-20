import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { matchIssues } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const issues = await db.query.matchIssues.findMany({
    where: eq(matchIssues.acknowledged, false),
    orderBy: [desc(matchIssues.createdAt)],
    limit: 100,
  });
  const productIds = [...new Set(issues.map((i) => i.productId))];
  const relatedProducts = productIds.length
    ? await db.query.products.findMany({ where: (p, { inArray }) => inArray(p.id, productIds) })
    : [];
  const productById = new Map(relatedProducts.map((p) => [p.id, p]));

  return NextResponse.json(
    issues.map((i) => ({ ...i, productName: productById.get(i.productId)?.name ?? "Unknown" }))
  );
}
