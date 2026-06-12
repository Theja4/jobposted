import type { ExtensionPlatform } from "@jobposted/shared";
import type { PlatformAdapter } from "../autofill/types";
import { genericAdvance, genericStep, genericSubmit } from "./common";

function hostAdapter(id: ExtensionPlatform, label: string, hosts: RegExp[], notes: string): PlatformAdapter {
  return {
    id,
    label,
    match: (url) => hosts.some((host) => host.test(url.hostname)),
    detectStep: genericStep,
    mapFields: () => [],
    findAdvance: genericAdvance,
    findSubmit: genericSubmit,
    notes,
  };
}

export const linkedinAdapter = hostAdapter("linkedin", "LinkedIn Easy Apply", [/linkedin\.com$/i], "Uses generic label/ARIA matching inside LinkedIn Easy Apply modals. Brittle areas: modal virtualization and anti-automation pacing.");
export const icimsAdapter = hostAdapter("icims", "iCIMS", [/icims\.com$/i], "Generic iCIMS shell; field labels are usually accessible, but tenant skins vary heavily.");
export const workableAdapter = hostAdapter("workable", "Workable", [/workable\.com$/i], "Generic Workable shell with common accessible inputs and file upload controls.");
export const smartRecruitersAdapter = hostAdapter("smartrecruiters", "SmartRecruiters", [/smartrecruiters\.com$/i], "Generic SmartRecruiters shell; custom selects may require user review.");
export const taleoAdapter = hostAdapter("taleo", "Taleo", [/taleo\.net$/i, /oraclecloud\.com$/i], "Generic Taleo/Oracle shell; older pages can use table layouts and iframes.");
export const successFactorsAdapter = hostAdapter("successfactors", "SuccessFactors", [/successfactors\.com$/i], "Generic SuccessFactors shell; dynamic SAP widgets can need manual review.");
export const jobviteAdapter = hostAdapter("jobvite", "Jobvite", [/jobvite\.com$/i], "Generic Jobvite shell.");
export const bambooAdapter = hostAdapter("bamboohr", "BambooHR", [/bamboohr\.com$/i], "Generic BambooHR shell.");
export const doverAdapter = hostAdapter("dover", "Dover", [/dover\.com$/i], "Generic Dover shell.");
export const indeedAdapter = hostAdapter("indeed", "Indeed Apply", [/indeed\.com$/i], "Generic Indeed Apply shell; final submit remains user-reviewed by default.");
export const ripplingAdapter = hostAdapter("rippling", "Rippling", [/rippling\.com$/i], "Generic Rippling shell.");
export const paylocityAdapter = hostAdapter("paylocity", "Paylocity", [/paylocity\.com$/i], "Generic Paylocity shell.");
