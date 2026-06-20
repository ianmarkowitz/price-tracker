import type { DiscoverySource } from "./types";
import { SerpApiDiscoverySource } from "./serpapi";
import { RetailerFallbackDiscoverySource } from "./retailer-fallback";

export * from "./types";

// Primary source is SerpAPI Google Shopping. If it errors or returns no
// match, fall back to the configurable retailer adapter list (empty by
// default; see retailer-fallback.ts).
export function getDiscoverySources(): DiscoverySource[] {
  const sources: DiscoverySource[] = [];
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (serpApiKey) {
    sources.push(new SerpApiDiscoverySource(serpApiKey));
  }
  sources.push(new RetailerFallbackDiscoverySource());
  return sources;
}

export async function discoverProduct(query: string) {
  const sources = getDiscoverySources();
  for (const source of sources) {
    try {
      const result = await source.search(query);
      if (result) return result;
    } catch (err) {
      console.error(`Discovery source ${source.name} failed:`, err);
    }
  }
  return null;
}
