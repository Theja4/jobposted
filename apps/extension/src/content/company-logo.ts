import { inferCompanyDomainFromUrl, logoDevCompanyLogoUrl } from "@jobposted/shared";
import { LOGO_DEV_TOKEN } from "../config/env";

// Builds a logo.dev image URL for the company shown in the panel. The domain
// (when the apply URL is on the company's own site) gives the sharpest logo;
// otherwise logo.dev falls back to a name lookup. Returns null when no token is
// baked in so callers can render a monogram instead.
export function companyLogoUrlFor(company: string, jobUrl?: string | null): string | null {
  if (!LOGO_DEV_TOKEN || !company.trim()) return null;
  const companyDomain = jobUrl ? inferCompanyDomainFromUrl(jobUrl) : null;
  return logoDevCompanyLogoUrl({ companyDomain, companyName: company, token: LOGO_DEV_TOKEN });
}
