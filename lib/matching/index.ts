import type { RawOffer } from "../discovery/types";
import type { products } from "../db/schema";

type Product = typeof products.$inferSelect;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// An offer is accepted if:
// - it matches the confirmed UPC (when we have one and the offer exposes one), OR
// - its normalized title contains every must-include keyword and none of the
//   must-exclude keywords, AND its listed price falls within the expected range.
export function offerMatchesProduct(
  offer: RawOffer,
  product: Product,
  confirmedUpc: string | null
): boolean {
  if (confirmedUpc && offer.upc) {
    return offer.upc === confirmedUpc;
  }

  const normalizedTitle = normalize(offer.title);

  for (const kw of product.mustInclude) {
    if (!normalizedTitle.includes(normalize(kw))) return false;
  }
  for (const kw of product.mustExclude) {
    if (normalizedTitle.includes(normalize(kw))) return false;
  }

  if (product.priceMin != null && offer.listedPrice < product.priceMin) return false;
  if (product.priceMax != null && offer.listedPrice > product.priceMax) return false;

  return true;
}

export function filterOffersForProduct(
  offers: RawOffer[],
  product: Product,
  confirmedUpc: string | null
): RawOffer[] {
  return offers.filter((o) => offerMatchesProduct(o, product, confirmedUpc));
}
