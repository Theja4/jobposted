import {
  CREEM_PRODUCT_ENV_BY_REGION,
  CURRENT_BILLING_PLAN_ID,
  billingRegionForCountry,
  type BillingPlan,
  type BillingPlanId,
  type BillingRegion,
  type BillingTenure,
} from "./plans";

export function creemApiBase() {
  if (process.env.CREEM_API_BASE_URL) return process.env.CREEM_API_BASE_URL.replace(/\/+$/, "");
  return process.env.CREEM_TEST_MODE === "true" ? "https://test-api.creem.io" : "https://api.creem.io";
}

export function creemApiKey() {
  return process.env.CREEM_API_KEY?.trim() || "";
}

function envText(name: string) {
  return process.env[name]?.trim() || "";
}

function globalProductEnvNamesForTenure(tenure: BillingTenure) {
  return tenure === "monthly"
    ? ["CREEM_MONTHLY_PRODUCT_ID", "CREEM_PRODUCT_ID", "CREEM_PRO_50_PRODUCT_ID"]
    : ["CREEM_QUARTERLY_PRODUCT_ID"];
}

function productIdFromEnvNames(envNames: string[]) {
  for (const envName of envNames) {
    const value = envText(envName);
    if (value) return value;
  }
  return "";
}

export function hasRegionalCreemProduct(region: BillingRegion, tenure: BillingTenure) {
  return Boolean(envText(CREEM_PRODUCT_ENV_BY_REGION[region][tenure]));
}

export function hasTenureCreemProduct(tenure: BillingTenure) {
  const regional = Object.values(CREEM_PRODUCT_ENV_BY_REGION).some((envByTenure) =>
    Boolean(envText(envByTenure[tenure])),
  );
  return regional || Boolean(productIdFromEnvNames(globalProductEnvNamesForTenure(tenure)));
}

export function creemProductIdForCheckout(args: {
  plan: BillingPlan;
  tenure: BillingTenure;
  countryCode?: string | null;
}) {
  if (args.plan.id !== CURRENT_BILLING_PLAN_ID) {
    return envText(args.plan.productEnv);
  }

  const region = billingRegionForCountry(args.countryCode);
  return (
    envText(CREEM_PRODUCT_ENV_BY_REGION[region][args.tenure]) ||
    productIdFromEnvNames(globalProductEnvNamesForTenure(args.tenure))
  );
}

export function creemPlanIdForProductId(productId: string): BillingPlanId | null {
  const id = productId.trim();
  if (!id) return null;

  if (id === envText("CREEM_STARTER_20_PRODUCT_ID")) return "starter_20";

  const currentProductIds = [
    envText("CREEM_PRODUCT_ID"),
    envText("CREEM_PRO_50_PRODUCT_ID"),
    ...Object.values(CREEM_PRODUCT_ENV_BY_REGION).flatMap((envByTenure) =>
      Object.values(envByTenure).map(envText),
    ),
    ...(["monthly", "quarterly"] as BillingTenure[]).flatMap((tenure) =>
      globalProductEnvNamesForTenure(tenure).map(envText),
    ),
  ].filter(Boolean);

  return currentProductIds.includes(id) ? CURRENT_BILLING_PLAN_ID : null;
}

export function readCreemUrl(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const record = payload as Record<string, unknown>;
  const url =
    record.checkout_url ??
    record.checkoutUrl ??
    record.customer_portal_link ??
    record.customerPortalLink ??
    record.url;
  return typeof url === "string" ? url.trim() : "";
}
