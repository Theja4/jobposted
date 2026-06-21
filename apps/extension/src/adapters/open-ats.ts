import type { PlatformAdapter } from "../autofill/types";
import { genericAdvance, genericStep, genericSubmit } from "./common";

export const greenhouseAdapter: PlatformAdapter = {
  id: "greenhouse",
  label: "Greenhouse",
  match: (url) => /(^|\.)greenhouse\.io$/i.test(url.hostname),
  detectStep: genericStep,
  mapFields: () => [
    {
      selector:
        "#first_name, input[name='job_application[first_name]'], input[name='first_name'], input[autocomplete='given-name'], input[data-source='first_name']",
      key: "identity.firstName",
    },
    {
      selector:
        "#last_name, input[name='job_application[last_name]'], input[name='last_name'], input[autocomplete='family-name'], input[data-source='last_name']",
      key: "identity.lastName",
    },
    {
      selector:
        "#email, input[type='email'], input[name='job_application[email]'], input[name='email'], input[autocomplete='email'], input[data-source='email']",
      key: "identity.email",
    },
    {
      selector:
        "#phone, input[type='tel'], input[name='job_application[phone]'], input[name='phone'], input[autocomplete='tel'], input[data-source='phone']",
      key: "identity.phone",
    },
    {
      selector:
        "#resume, input[type='file'][name*='resume' i], input[type='file'][id*='resume' i], input[type='file'][aria-label*='resume' i]",
      key: "documents.resume",
    },
    {
      selector:
        "#cover_letter, input[type='file'][name*='cover' i], input[type='file'][id*='cover' i], input[type='file'][aria-label*='cover' i]",
      key: "documents.coverLetter",
    },
    { selector: "input[name*='linkedin' i], input[id*='linkedin' i], input[aria-label*='linkedin' i]", key: "links.linkedin" },
    { selector: "input[name*='github' i], input[id*='github' i], input[aria-label*='github' i]", key: "links.github" },
    {
      selector:
        "input[name*='website' i], input[name*='portfolio' i], input[id*='website' i], input[id*='portfolio' i], input[autocomplete='url']",
      key: "links.portfolio",
    },
  ],
  findAdvance: genericAdvance,
  findSubmit: genericSubmit,
  notes:
    "Targets Greenhouse's public board field ids/names. Embedded boards can wrap the same fields in iframes; this content script fills the host page only when the form DOM is accessible.",
};

export const leverAdapter: PlatformAdapter = {
  id: "lever",
  label: "Lever",
  match: (url) => /(^|\.)lever\.co$/i.test(url.hostname),
  detectStep: genericStep,
  mapFields: () => [
    { selector: "input[name='name'], input[name='fullName'], input[autocomplete='name']", key: "identity.fullName" },
    { selector: "input[name='email'], input[type='email'], input[autocomplete='email']", key: "identity.email" },
    { selector: "input[name='phone'], input[type='tel'], input[autocomplete='tel']", key: "identity.phone" },
    { selector: "input[name='urls[LinkedIn]'], input[name*='linkedin' i], input[id*='linkedin' i]", key: "links.linkedin" },
    { selector: "input[name='urls[GitHub]'], input[name*='github' i], input[id*='github' i]", key: "links.github" },
    {
      selector:
        "input[name='urls[Portfolio]'], input[name*='portfolio' i], input[name*='website' i], input[id*='portfolio' i], input[id*='website' i]",
      key: "links.portfolio",
    },
    {
      selector: "input[type='file'][name*='resume' i], input[type='file'][id*='resume' i], input[type='file'][aria-label*='resume' i]",
      key: "documents.resume",
    },
    {
      selector: "input[type='file'][name*='cover' i], input[type='file'][id*='cover' i], input[type='file'][aria-label*='cover' i]",
      key: "documents.coverLetter",
    },
  ],
  findAdvance: genericAdvance,
  findSubmit: genericSubmit,
  notes:
    "Lever usually exposes a single full-name field and straightforward contact/file inputs. Brittle areas: custom questions after resume parse and company-specific required checkboxes.",
};

export const ashbyAdapter: PlatformAdapter = {
  id: "ashby",
  label: "Ashby",
  match: (url) => /(^|\.)ashbyhq\.com$/i.test(url.hostname),
  detectStep: genericStep,
  mapFields: () => [
    { selector: "input[name='name'], input[name='_systemfield_name'], input[autocomplete='name']", key: "identity.fullName" },
    {
      selector: "input[name='firstName'], input[name='_systemfield_firstName'], input[autocomplete='given-name']",
      key: "identity.firstName",
    },
    {
      selector: "input[name='lastName'], input[name='_systemfield_lastName'], input[autocomplete='family-name']",
      key: "identity.lastName",
    },
    { selector: "input[name='email'], input[name='_systemfield_email'], input[type='email'], input[autocomplete='email']", key: "identity.email" },
    { selector: "input[name='phone'], input[name='_systemfield_phone'], input[type='tel'], input[autocomplete='tel']", key: "identity.phone" },
    {
      selector:
        "input[type='file'][name*='resume' i], input[type='file'][id*='resume' i], input[type='file'][aria-label*='resume' i], [data-testid*='resume' i] input[type='file']",
      key: "documents.resume",
    },
    {
      selector:
        "input[type='file'][name*='cover' i], input[type='file'][id*='cover' i], input[type='file'][aria-label*='cover' i], [data-testid*='cover' i] input[type='file']",
      key: "documents.coverLetter",
    },
    { selector: "input[name*='linkedin' i], input[id*='linkedin' i], input[aria-label*='linkedin' i]", key: "links.linkedin" },
    { selector: "input[name*='github' i], input[id*='github' i], input[aria-label*='github' i]", key: "links.github" },
    {
      selector:
        "input[name*='website' i], input[name*='portfolio' i], input[id*='website' i], input[id*='portfolio' i], input[autocomplete='url']",
      key: "links.portfolio",
    },
  ],
  findAdvance: genericAdvance,
  findSubmit: genericSubmit,
  notes:
    "Ashby React forms usually keep accessible labels and stable input names. Brittle areas: custom questions rendered as nested design-system controls.",
};
