export type RawOffer = {
  seller: string;
  link: string;
  listedPrice: number;
  shipping: number;
  inStock: boolean;
  title: string;
  upc?: string;
};

export type DiscoveryResult = {
  // Best-guess canonical product, if the source exposes grouping (e.g. Google Shopping product page).
  canonicalTitle: string;
  canonicalUpc?: string;
  imageUrl?: string;
  offers: RawOffer[];
};

export interface DiscoverySource {
  name: string;
  search(query: string): Promise<DiscoveryResult | null>;
}
