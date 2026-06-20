export type PricedOffer = {
  seller: string;
  link: string;
  listedPrice: number;
  shipping: number;
  rewardsPoints: number;
  pointValueUsd: number;
  inStock: boolean;
};

export type EffectiveOffer = PricedOffer & {
  rewardsValue: number;
  effectivePrice: number;
};

export function computeEffectivePrice(offer: PricedOffer): EffectiveOffer {
  const rewardsValue = offer.rewardsPoints * offer.pointValueUsd;
  const effectivePrice = offer.listedPrice + offer.shipping - rewardsValue;
  return { ...offer, rewardsValue, effectivePrice };
}

// Best price = minimum effective price among in-stock offers only.
export function bestOffer(offers: EffectiveOffer[]): EffectiveOffer | null {
  const inStock = offers.filter((o) => o.inStock);
  if (inStock.length === 0) return null;
  return inStock.reduce((min, o) => (o.effectivePrice < min.effectivePrice ? o : min));
}

export type AlertDecision = {
  shouldAlert: boolean;
  trailingLow: number | null;
  priorPrice: number | null;
};

// Default rule: alert when current best effective price is <= trailing low
// (over alertWindowDays) AND at least alertMarginPct below the most recent
// prior reading. Trailing low/prior price must come from history *before*
// the current reading.
export function evaluateAlertRule(params: {
  currentEffectivePrice: number;
  trailingLowBeforeNow: number | null;
  priorEffectivePrice: number | null;
  alertMarginPct: number;
}): AlertDecision {
  const { currentEffectivePrice, trailingLowBeforeNow, priorEffectivePrice, alertMarginPct } =
    params;

  if (trailingLowBeforeNow == null) {
    return { shouldAlert: false, trailingLow: trailingLowBeforeNow, priorPrice: priorEffectivePrice };
  }

  const atOrBelowTrailingLow = currentEffectivePrice <= trailingLowBeforeNow;

  let belowPriorByMargin = true;
  if (priorEffectivePrice != null) {
    const requiredMax = priorEffectivePrice * (1 - alertMarginPct / 100);
    belowPriorByMargin = currentEffectivePrice <= requiredMax;
  }

  return {
    shouldAlert: atOrBelowTrailingLow && belowPriorByMargin,
    trailingLow: trailingLowBeforeNow,
    priorPrice: priorEffectivePrice,
  };
}
