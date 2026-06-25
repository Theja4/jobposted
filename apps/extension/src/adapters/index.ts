import type { PlatformAdapter } from "../autofill/types";
import { makeGenericAdapter } from "./common";
import { workdayAdapter } from "./workday";

// The AI-driven engine in src/content/* now handles every ATS except Workday, so the
// legacy adapter list is down to Workday plus the generic fallback. detectAdapter is
// only reached from the Workday branch of content.tsx's runAutofillPage.
const adapters: PlatformAdapter[] = [workdayAdapter, makeGenericAdapter()];

export function detectAdapter(url = window.location.href, dom = document): PlatformAdapter {
  const parsed = new URL(url);
  return adapters.find((adapter) => adapter.match(parsed, dom)) ?? makeGenericAdapter();
}

export { adapters };
