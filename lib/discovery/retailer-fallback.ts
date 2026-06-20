import type { DiscoveryResult, DiscoverySource, RawOffer } from "./types";

// Optional fallback: a configurable list of retailer site-search adapters,
// used to supplement or replace the aggregator if SerpAPI is unavailable
// or doesn't cover a given retailer. Each adapter implements its own
// site-search parsing; none are wired up by default since they require
// per-retailer HTML/JSON shapes that change over time. Add one by
// implementing RetailerAdapter and registering it in RETAILER_ADAPTERS.
export interface RetailerAdapter {
  retailerName: string;
  search(query: string): Promise<RawOffer[]>;
}

export const RETAILER_ADAPTERS: RetailerAdapter[] = [];

export class RetailerFallbackDiscoverySource implements DiscoverySource {
  name = "retailer-fallback";

  constructor(private adapters: RetailerAdapter[] = RETAILER_ADAPTERS) {}

  async search(query: string): Promise<DiscoveryResult | null> {
    if (this.adapters.length === 0) return null;

    const allOffers: RawOffer[] = [];
    for (const adapter of this.adapters) {
      try {
        const offers = await adapter.search(query);
        allOffers.push(...offers);
      } catch (err) {
        console.error(`Retailer adapter ${adapter.retailerName} failed:`, err);
      }
    }

    if (allOffers.length === 0) return null;

    return {
      canonicalTitle: allOffers[0].title,
      offers: allOffers,
    };
  }
}
