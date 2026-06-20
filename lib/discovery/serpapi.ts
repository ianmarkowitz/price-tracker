import type { DiscoveryResult, DiscoverySource, RawOffer } from "./types";

// SerpAPI's Google Shopping engine returns a list of shopping_results,
// each with a product_id we can use to fetch the full offer list via
// google_product (all sellers for that canonical item). We use the
// search results directly when google_product isn't needed, but prefer
// the product page when available since it groups offers under one
// canonical title/UPC.
export class SerpApiDiscoverySource implements DiscoverySource {
  name = "serpapi-google-shopping";

  constructor(private apiKey: string) {}

  async search(query: string): Promise<DiscoveryResult | null> {
    const searchUrl = new URL("https://serpapi.com/search.json");
    searchUrl.searchParams.set("engine", "google_shopping");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("api_key", this.apiKey);

    const res = await fetch(searchUrl.toString());
    if (!res.ok) {
      throw new Error(`SerpAPI search failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const results = data.shopping_results as
      | Array<{
          title: string;
          product_id?: string;
          product_link?: string;
          price?: string;
          extracted_price?: number;
          source?: string;
          link?: string;
        }>
      | undefined;

    if (!results || results.length === 0) return null;

    const topProductId = results.find((r) => r.product_id)?.product_id;
    if (topProductId) {
      const fromProduct = await this.fetchProductOffers(topProductId, results[0].title);
      if (fromProduct) return fromProduct;
    }

    // Fallback: treat the flat search results as offers directly (no grouping available).
    const offers: RawOffer[] = results
      .filter((r) => r.extracted_price !== undefined && r.source)
      .map((r) => ({
        seller: r.source!,
        link: r.link ?? r.product_link ?? "",
        listedPrice: r.extracted_price!,
        shipping: 0,
        inStock: true,
        title: r.title,
      }));

    if (offers.length === 0) return null;

    return {
      canonicalTitle: results[0].title,
      offers,
    };
  }

  private async fetchProductOffers(
    productId: string,
    fallbackTitle: string
  ): Promise<DiscoveryResult | null> {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_product");
    url.searchParams.set("product_id", productId);
    url.searchParams.set("api_key", this.apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();

    const productResults = data.sellers_results?.online_sellers as
      | Array<{
          name: string;
          link?: string;
          base_price?: string;
          extracted_base_price?: number;
          additional_price?: string;
          extracted_additional_price?: number;
          total_price?: string;
          extracted_total_price?: number;
          details_and_offers?: Array<{ text: string }>;
        }>
      | undefined;

    if (!productResults || productResults.length === 0) return null;

    const productInfo = data.product_results as
      | { title?: string; gtin?: string; upc?: string; media?: Array<{ link: string }> }
      | undefined;

    const offers: RawOffer[] = productResults.map((s) => {
      const listedPrice = s.extracted_base_price ?? s.extracted_total_price ?? 0;
      const shipping = s.extracted_additional_price ?? 0;
      const outOfStock = (s.details_and_offers ?? []).some((d) =>
        /out of stock|sold out/i.test(d.text)
      );
      return {
        seller: s.name,
        link: s.link ?? "",
        listedPrice,
        shipping,
        inStock: !outOfStock,
        title: productInfo?.title ?? fallbackTitle,
      };
    });

    return {
      canonicalTitle: productInfo?.title ?? fallbackTitle,
      canonicalUpc: productInfo?.gtin ?? productInfo?.upc,
      imageUrl: productInfo?.media?.[0]?.link,
      offers,
    };
  }
}
