import type { PlatformAdapter } from "../autofill/types";
import { makeGenericAdapter } from "./common";
import { workdayAdapter } from "./workday";
import { ashbyAdapter, greenhouseAdapter, leverAdapter } from "./open-ats";
import {
  bambooAdapter,
  doverAdapter,
  icimsAdapter,
  indeedAdapter,
  jobviteAdapter,
  linkedinAdapter,
  paylocityAdapter,
  ripplingAdapter,
  smartRecruitersAdapter,
  successFactorsAdapter,
  taleoAdapter,
  workableAdapter,
} from "./more";

const adapters: PlatformAdapter[] = [
  workdayAdapter,
  greenhouseAdapter,
  leverAdapter,
  ashbyAdapter,
  linkedinAdapter,
  icimsAdapter,
  workableAdapter,
  smartRecruitersAdapter,
  taleoAdapter,
  successFactorsAdapter,
  jobviteAdapter,
  bambooAdapter,
  doverAdapter,
  indeedAdapter,
  ripplingAdapter,
  paylocityAdapter,
  makeGenericAdapter(),
];

export function detectAdapter(url = window.location.href, dom = document): PlatformAdapter {
  const parsed = new URL(url);
  return adapters.find((adapter) => adapter.match(parsed, dom)) ?? makeGenericAdapter();
}

export { adapters };
