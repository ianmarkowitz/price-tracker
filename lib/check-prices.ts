import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "./db";
import {
  alerts,
  matchIssues,
  priceHistory,
  productConfirmations,
  products,
} from "./db/schema";
import { discoverProduct } from "./discovery";
import { filterOffersForProduct } from "./matching";
import { bestOffer, computeEffectivePrice, evaluateAlertRule } from "./pricing";
import type { AlertDigestItem, MatchIssueItem } from "./email";

export async function checkAllProducts(): Promise<{
  alertItems: AlertDigestItem[];
  matchIssueItems: MatchIssueItem[];
}> {
  const activeProducts = await db.query.products.findMany({
    where: eq(products.active, true),
  });

  const alertItems: AlertDigestItem[] = [];
  const matchIssueItems: MatchIssueItem[] = [];

  for (const product of activeProducts) {
    try {
      await checkOneProduct(product, alertItems, matchIssueItems);
    } catch (err) {
      console.error(`Error checking product ${product.id} (${product.name}):`, err);
      await db.insert(matchIssues).values({
        productId: product.id,
        reason: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      matchIssueItems.push({
        productName: product.name,
        reason: "Check failed due to an internal error; see logs.",
      });
    }
    // Space out requests to be gentle on the discovery API's rate limits.
    await sleep(1500);
  }

  return { alertItems, matchIssueItems };
}

async function checkOneProduct(
  product: typeof products.$inferSelect,
  alertItems: AlertDigestItem[],
  matchIssueItems: MatchIssueItem[]
) {
  const confirmation = await db.query.productConfirmations.findFirst({
    where: eq(productConfirmations.productId, product.id),
  });

  if (!confirmation) {
    // Not yet confirmed by the human; skip tracking, no issue needed (it's expected).
    return;
  }

  const result = await discoverProduct(product.searchTerm);
  if (!result || result.offers.length === 0) {
    await recordMatchIssue(product, "No offers found in this run.", matchIssueItems);
    return;
  }

  const matched = filterOffersForProduct(result.offers, product, confirmation.canonicalUpc);
  if (matched.length === 0) {
    await recordMatchIssue(
      product,
      "No offers matched the confirmed identity / keyword rules this run.",
      matchIssueItems
    );
    return;
  }

  const sellerNames = [...new Set(matched.map((o) => o.seller))];
  const settings = await db.query.sellerSettings.findMany();
  const settingsByName = new Map(settings.map((s) => [s.seller, s]));

  const checkedAt = new Date();
  const insertedRows: { id: number; effectivePrice: number; seller: string; link: string; listedPrice: number; shipping: number; rewardsValue: number; inStock: boolean }[] =
    [];

  for (const offer of matched) {
    const sellerSetting = settingsByName.get(offer.seller);
    const pointValueUsd = sellerSetting?.pointValueUsd ?? 0.01;
    const pointsPerDollar = sellerSetting?.pointsPerDollar ?? 0;
    const rewardsPoints = offer.listedPrice * pointsPerDollar;

    const priced = computeEffectivePrice({
      seller: offer.seller,
      link: offer.link,
      listedPrice: offer.listedPrice,
      shipping: offer.shipping,
      rewardsPoints,
      pointValueUsd,
      inStock: offer.inStock,
    });

    const [row] = await db
      .insert(priceHistory)
      .values({
        productId: product.id,
        seller: priced.seller,
        link: priced.link,
        listedPrice: priced.listedPrice,
        shipping: priced.shipping,
        rewardsPoints: priced.rewardsPoints,
        pointValueUsd: priced.pointValueUsd,
        rewardsValue: priced.rewardsValue,
        effectivePrice: priced.effectivePrice,
        inStock: priced.inStock,
        isBest: false,
        checkedAt,
      })
      .returning();

    insertedRows.push(row);
  }

  const effectiveOffers = matched.map((offer, i) => {
    const sellerSetting = settingsByName.get(offer.seller);
    return computeEffectivePrice({
      seller: offer.seller,
      link: offer.link,
      listedPrice: offer.listedPrice,
      shipping: offer.shipping,
      rewardsPoints: offer.listedPrice * (sellerSetting?.pointsPerDollar ?? 0),
      pointValueUsd: sellerSetting?.pointValueUsd ?? 0.01,
      inStock: offer.inStock,
    });
  });

  const best = bestOffer(effectiveOffers);
  if (!best) {
    await recordMatchIssue(product, "All matched offers are out of stock.", matchIssueItems);
    await db.update(products).set({ lastCheckedAt: checkedAt }).where(eq(products.id, product.id));
    return;
  }

  const bestRowIndex = matched.findIndex(
    (o) => o.seller === best.seller && o.link === best.link
  );
  if (bestRowIndex >= 0) {
    await db
      .update(priceHistory)
      .set({ isBest: true })
      .where(eq(priceHistory.id, insertedRows[bestRowIndex].id));
  }

  await db.update(products).set({ lastCheckedAt: checkedAt }).where(eq(products.id, product.id));

  // Determine trailing low and prior reading from history *before* this run.
  const windowStart = new Date(checkedAt.getTime() - product.alertWindowDays * 24 * 60 * 60 * 1000);

  const priorBestRows = await db.query.priceHistory.findMany({
    where: and(
      eq(priceHistory.productId, product.id),
      eq(priceHistory.isBest, true),
      lt(priceHistory.checkedAt, checkedAt)
    ),
    orderBy: [desc(priceHistory.checkedAt)],
  });

  const priorEffectivePrice = priorBestRows[0]?.effectivePrice ?? null;
  const trailingRows = priorBestRows.filter((r) => r.checkedAt >= windowStart);
  const trailingLow =
    trailingRows.length > 0 ? Math.min(...trailingRows.map((r) => r.effectivePrice)) : null;

  const decision = evaluateAlertRule({
    currentEffectivePrice: best.effectivePrice,
    trailingLowBeforeNow: trailingLow,
    priorEffectivePrice,
    alertMarginPct: product.alertMarginPct,
  });

  if (!decision.shouldAlert) return;

  // Cooldown: skip if we already alerted within alertCooldownHours.
  const cooldownStart = new Date(
    checkedAt.getTime() - product.alertCooldownHours * 60 * 60 * 1000
  );
  const recentAlert = await db.query.alerts.findFirst({
    where: and(eq(alerts.productId, product.id), gte(alerts.createdAt, cooldownStart)),
  });
  if (recentAlert) return;

  const bestHistoryRow = bestRowIndex >= 0 ? insertedRows[bestRowIndex] : null;
  if (!bestHistoryRow) return;

  await db.insert(alerts).values({
    productId: product.id,
    priceHistoryId: bestHistoryRow.id,
    effectivePrice: best.effectivePrice,
    priorPrice: decision.priorPrice,
    trailingLow: decision.trailingLow,
    sentAt: checkedAt,
  });

  alertItems.push({
    productName: product.name,
    effectivePrice: best.effectivePrice,
    seller: best.seller,
    link: best.link,
    listedPrice: best.listedPrice,
    shipping: best.shipping,
    rewardsValue: best.rewardsValue,
    priorPrice: decision.priorPrice,
    trailingLow: decision.trailingLow,
  });
}

async function recordMatchIssue(
  product: typeof products.$inferSelect,
  reason: string,
  matchIssueItems: MatchIssueItem[]
) {
  await db.insert(matchIssues).values({ productId: product.id, reason });
  matchIssueItems.push({ productName: product.name, reason });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
