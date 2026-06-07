# @jobposted/extension — Phase 5 (not yet implemented)

A **Manifest V3** Chrome extension for **logged-in platforms** (LinkedIn, login-gated
Workday) where the application must originate from the user's own browser, session, and IP —
running these from a datacenter IP gets the user restricted (design doc §13.1, §11.7).

> Deferred on purpose. Do **not** build this until the Greenhouse/Lever server-side apply path
> is converting (design doc §22). It is built with GPT-5.5 for the popup UI and Opus 4.8 for
> the MV3 data-not-code architecture and the LinkedIn content script (Prompt 7).

## Reuse the proven Rezoomed pattern

Rezoomed already ships a Chrome-approved MV3 extension built with **WXT** — clone its shape:
`resumeplanet/linkedin-profile-optimizer-extension/wxt.config.ts`. Key things to copy:

- **WXT + TypeScript + React popup**, `manifestVersion: 3`.
- **Minimal permissions.** Start with `storage` + explicit `host_permissions` for named ATS
  domains (`*://*.greenhouse.io/*`, `*://*.lever.co/*`, `*://*.myworkdayjobs.com/*`,
  `*://*.linkedin.com/*`). **Never `<all_urls>`** — it triggers the "read and change all your
  data on all websites" warning and deep manual review (design doc §13.3).
- **`externally_connectable`** to your web origin so the site can wake the service worker for
  silent token refresh.
- Drop localhost host-permissions from production builds for the smallest reviewer footprint.

## The MV3 constraint that decides everything (design doc §13.2)

**No remotely-hosted code execution.** The reviewer must determine full functionality from the
package. So the field-mapping logic lives **in the package**, and the backend returns **data**
(the field map and values) — never code. This is the same `FieldMap` contract the server
worker uses (`@jobposted/shared` → `FieldMap`). Architect around this from the first commit.

## Planned shape (design doc §13.2, §13.4)

```
src/
  background.ts     service worker: fetch profile, fetch field map (DATA), report status
  content/          per-ATS content scripts that fill the DOM from the field map (CSS-only motion)
  popup/            React popup mirroring the web review queue (queue, start/pause, status)
manifest.json       one written justification per permission
```

- A first-run onboarding page (pin the icon, run the first application).
- A live fill overlay (a light CSS highlight pulse per field) — doubles as the trust signal (§23.9).
- **Never auto-submit by default**; auto-submit is an explicit opt-in toggle (§13.4).

## Store submission (design doc §13.5)

$5 one-time developer fee · MV3 only · single-purpose statement ("autofill and submit job
applications") · privacy policy + terms URLs required · launch **Unlisted** for beta · expect
at least one rejection. Plan ~2 weeks of review for an automation extension.
