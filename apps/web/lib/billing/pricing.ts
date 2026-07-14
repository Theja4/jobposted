import "server-only";

import {
  BILLING_REGIONS,
  BILLING_TENURE_META,
  BILLING_TENURES,
  CURRENT_BILLING_PLAN_ID,
  DEFAULT_US_PRICE_LABELS,
  PRICE_LABEL_ENV_BY_REGION,
  billingRegionForCountry,
  type BillingPricingView,
  type BillingRegion,
  type BillingTenure,
} from "./plans";
import { hasRegionalCreemProduct, hasTenureCreemProduct } from "./creem";

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function priceLabelFor(region: BillingRegion, tenure: BillingTenure) {
  return (
    envText(PRICE_LABEL_ENV_BY_REGION[region][tenure]) ||
    envText(PRICE_LABEL_ENV_BY_REGION.us[tenure]) ||
    DEFAULT_US_PRICE_LABELS[tenure]
  );
}

export function getPricingViewForCountry(countryCode: string | null | undefined): BillingPricingView {
  const country = countryCode?.trim().toUpperCase() || null;
  const region = billingRegionForCountry(country);
  const regionMeta = BILLING_REGIONS[region];
  const regionalProductsReady = BILLING_TENURES.every((tenure) =>
    hasRegionalCreemProduct(region, tenure),
  );
  const regionalLabelsReady =
    region === "us" ||
    BILLING_TENURES.every((tenure) => Boolean(envText(PRICE_LABEL_ENV_BY_REGION[region][tenure])));
  const localPricingReady = region === "us" || (regionalProductsReady && regionalLabelsReady);

  return {
    planId: CURRENT_BILLING_PLAN_ID,
    region,
    regionLabel: regionMeta.label,
    countryCode: country,
    currencyCode: localPricingReady ? regionMeta.currencyCode : BILLING_REGIONS.us.currencyCode,
    localPricingReady,
    options: BILLING_TENURES.map((tenure) => ({
      tenure,
      label: BILLING_TENURE_META[tenure].label,
      priceLabel: priceLabelFor(localPricingReady ? region : "us", tenure),
      cadence: BILLING_TENURE_META[tenure].cadence,
      productConfigured: localPricingReady
        ? hasRegionalCreemProduct(region, tenure)
        : hasTenureCreemProduct(tenure),
      highlighted: tenure === "quarterly",
    })),
  };
}
