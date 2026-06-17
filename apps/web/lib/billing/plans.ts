export type BillingPlanId = "jobposted_20";

export type BillingTenure = "monthly" | "quarterly";

export type BillingRegion = "us" | "eu" | "gb" | "in" | "au" | "ca";

export type BillingStatus = "trialing" | "active" | "past_due" | "canceled";

export type BillingPlan = {
  id: BillingPlanId;
  label: string;
  dailyLimit: number;
  productEnv: string;
  checkoutEnv: string;
};

export type BillingPricingOption = {
  tenure: BillingTenure;
  label: string;
  priceLabel: string;
  cadence: string;
  productConfigured: boolean;
  highlighted?: boolean;
};

export type BillingPricingView = {
  planId: BillingPlanId;
  region: BillingRegion;
  regionLabel: string;
  countryCode: string | null;
  currencyCode: string;
  localPricingReady: boolean;
  note: string | null;
  options: BillingPricingOption[];
};

export const CURRENT_BILLING_PLAN_ID: BillingPlanId = "jobposted_20";

export const BILLING_TENURES: BillingTenure[] = ["monthly", "quarterly"];

export const BILLING_TENURE_META: Record<BillingTenure, { label: string; cadence: string }> = {
  monthly: { label: "Monthly", cadence: "per month" },
  quarterly: { label: "Quarterly", cadence: "per quarter" },
};

export const BILLING_REGIONS: Record<
  BillingRegion,
  { label: string; currencyCode: string; countries: string[] }
> = {
  us: { label: "United States", currencyCode: "USD", countries: ["US"] },
  eu: {
    label: "Europe",
    currencyCode: "EUR",
    countries: [
      "AT",
      "BE",
      "BG",
      "HR",
      "CY",
      "CZ",
      "DK",
      "EE",
      "FI",
      "FR",
      "DE",
      "GR",
      "HU",
      "IE",
      "IT",
      "LV",
      "LT",
      "LU",
      "MT",
      "NL",
      "PL",
      "PT",
      "RO",
      "SK",
      "SI",
      "ES",
      "SE",
    ],
  },
  gb: { label: "United Kingdom", currencyCode: "GBP", countries: ["GB"] },
  in: { label: "India", currencyCode: "INR", countries: ["IN"] },
  au: { label: "Australia", currencyCode: "AUD", countries: ["AU"] },
  ca: { label: "Canada", currencyCode: "CAD", countries: ["CA"] },
};

export const DEFAULT_US_PRICE_LABELS: Record<BillingTenure, string> = {
  monthly: "$19.99",
  quarterly: "$39.99",
};

export const CREEM_PRODUCT_ENV_BY_REGION: Record<BillingRegion, Record<BillingTenure, string>> = {
  us: {
    monthly: "CREEM_US_MONTHLY_PRODUCT_ID",
    quarterly: "CREEM_US_QUARTERLY_PRODUCT_ID",
  },
  eu: {
    monthly: "CREEM_EU_MONTHLY_PRODUCT_ID",
    quarterly: "CREEM_EU_QUARTERLY_PRODUCT_ID",
  },
  gb: {
    monthly: "CREEM_GB_MONTHLY_PRODUCT_ID",
    quarterly: "CREEM_GB_QUARTERLY_PRODUCT_ID",
  },
  in: {
    monthly: "CREEM_IN_MONTHLY_PRODUCT_ID",
    quarterly: "CREEM_IN_QUARTERLY_PRODUCT_ID",
  },
  au: {
    monthly: "CREEM_AU_MONTHLY_PRODUCT_ID",
    quarterly: "CREEM_AU_QUARTERLY_PRODUCT_ID",
  },
  ca: {
    monthly: "CREEM_CA_MONTHLY_PRODUCT_ID",
    quarterly: "CREEM_CA_QUARTERLY_PRODUCT_ID",
  },
};

export const PRICE_LABEL_ENV_BY_REGION: Record<BillingRegion, Record<BillingTenure, string>> = {
  us: {
    monthly: "BILLING_US_MONTHLY_PRICE_LABEL",
    quarterly: "BILLING_US_QUARTERLY_PRICE_LABEL",
  },
  eu: {
    monthly: "BILLING_EU_MONTHLY_PRICE_LABEL",
    quarterly: "BILLING_EU_QUARTERLY_PRICE_LABEL",
  },
  gb: {
    monthly: "BILLING_GB_MONTHLY_PRICE_LABEL",
    quarterly: "BILLING_GB_QUARTERLY_PRICE_LABEL",
  },
  in: {
    monthly: "BILLING_IN_MONTHLY_PRICE_LABEL",
    quarterly: "BILLING_IN_QUARTERLY_PRICE_LABEL",
  },
  au: {
    monthly: "BILLING_AU_MONTHLY_PRICE_LABEL",
    quarterly: "BILLING_AU_QUARTERLY_PRICE_LABEL",
  },
  ca: {
    monthly: "BILLING_CA_MONTHLY_PRICE_LABEL",
    quarterly: "BILLING_CA_QUARTERLY_PRICE_LABEL",
  },
};

export function parseTenure(value: unknown): BillingTenure | null {
  return value === "monthly" || value === "quarterly" ? value : null;
}

export function billingRegionForCountry(countryCode: unknown): BillingRegion {
  const country = typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";
  if (!country) return "us";
  for (const [region, meta] of Object.entries(BILLING_REGIONS) as Array<
    [BillingRegion, (typeof BILLING_REGIONS)[BillingRegion]]
  >) {
    if (meta.countries.includes(country)) return region;
  }
  return "us";
}

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  jobposted_20: {
    id: "jobposted_20",
    label: "JobPosted",
    dailyLimit: 20,
    productEnv: "CREEM_PRODUCT_ID",
    checkoutEnv: "CHECKOUT_URL",
  },
};

export function parsePlan(value: unknown): BillingPlanId | null {
  if (value === "jobposted_20" || value === "starter_20" || value === "pro_50") {
    return CURRENT_BILLING_PLAN_ID;
  }
  return null;
}

export function planFor(value: unknown): BillingPlan | null {
  const plan = parsePlan(value);
  return plan ? BILLING_PLANS[plan] : null;
}

export function normalizeBillingStatus(value: unknown): BillingStatus {
  const status = typeof value === "string" ? value.toLowerCase() : "";
  if (status === "active" || status === "paid" || status === "completed") return "active";
  if (status === "trialing" || status === "trial") return "trialing";
  if (status === "past_due" || status === "past-due" || status === "failed") return "past_due";
  if (status === "canceled" || status === "cancelled" || status === "deleted") return "canceled";
  return "canceled";
}
