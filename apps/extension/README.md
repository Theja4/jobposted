# JobPosted Chrome Extension

Manifest V3 extension for login-gated job applications. The extension fills ATS forms inside the user's authenticated Chrome session, attaches the JobPosted/Rezoomed resume, stops at final Submit by default, and syncs the fill record back to the JobPosted dashboard.

## Stack

- WXT, Manifest V3, TypeScript
- React 19 for popup, options, and the in-page shadow-DOM overlay
- Tailwind CSS v4 via `@tailwindcss/vite`
- `@jobposted/shared` for profile, application sync, settings, and message types
- Supabase session reuse through the JobPosted web app bridge

## Environment

Create `apps/extension/.env.local` for local development only when you need to override the web app origin:

```bash
WXT_JOBPOSTED_WEB_ORIGIN=http://localhost:3100
WXT_SUPABASE_URL=...
WXT_SUPABASE_ANON_KEY=...
WXT_INCLUDE_LOCALHOST=1
```

Extension builds default to `https://jobposted.app`. Local-only builds must explicitly set
`WXT_JOBPOSTED_WEB_ORIGIN=http://localhost:3100` and `WXT_INCLUDE_LOCALHOST=1`.
The service-role key and AI/model keys are never bundled into the extension.

The web app routes use:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...        # required for Mercury 2 autofill planning
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_TIMEOUT_MS=18000
```

## Run

```bash
pnpm install
pnpm -F @jobposted/extension dev
```

## Build And Load Unpacked

```bash
pnpm -F @jobposted/extension build
```

For local Chrome debugging with readable stack traces and source maps:

```bash
pnpm -F @jobposted/extension build:debug
```

Load this folder in Chrome:

```text
apps/extension/.output/chrome-mv3
```

Chrome steps:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select `apps/extension/.output/chrome-mv3`

## Auth Flow

The popup opens `/extension/bridge` on the JobPosted web app. If the user is already signed in, the bridge page posts the Supabase session to the JobPosted-origin content script, which forwards it to the background service worker. The background stores the session in `chrome.storage.local` and owns all API calls.

The extension never collects or stores Workday, LinkedIn, or employer passwords.

## Production Reliability

- Live builds default to `https://jobposted.app`; local-only builds should explicitly set
  `WXT_JOBPOSTED_WEB_ORIGIN=http://localhost:3100` and `WXT_INCLUDE_LOCALHOST=1`.
- Application sync is durable: transient network/server failures are stored in
  `chrome.storage.local`, retried with `chrome.alarms`, and shown in the popup as pending syncs.
- Filled-but-not-submitted extension records do **not** set `submitted_at`, so they do not count
  against paid daily application limits.
- The web app exposes `GET /api/health` for deployment monitoring. Autofill planning runs through
  the server-side `/api/extension/autofill-plan` route, so model keys never enter the extension.
- Extension autofill fills fields only. It never clicks the site's Submit button.

## Autofill Architecture

- `entrypoints/background.ts`: session storage, refresh, settings, API proxy, application sync.
- `entrypoints/content.tsx`: session bridge listener, right-docked in-page panel, field extraction, and fill runner.
- `entrypoints/popup/*`: toolbar launcher that opens the in-page panel and reports blocked-tab errors.
- `src/content/autofill.ts`: compact field extraction and DOM application of the server plan.

## Adding A Supported Host

1. Add the host pattern to `ATS_HOSTS` in `wxt.config.ts` only if it is a named supported domain.
2. Add a small DOM fixture under `src/fixtures/`.
3. Add/extend `src/content/autofill.test.ts` so extraction still emits compact fields.
4. Keep provider-specific mapping rules in the server planner or prompt, not in the extension bundle.

The extension auto-mounts content scripts on named ATS hosts. User-triggered autofill also injects
the in-page panel into the active HTTP/HTTPS tab so company-hosted forms and embedded ATS pages work.

## Autofill Planning

Planning order:

1. Content script extracts compact field descriptors: handle, label, type, options, required state,
   current value, and local section/repeater context.
2. Background proxies the descriptors to `/api/extension/autofill-plan`.
3. The web route authenticates the extension, loads the server-side master profile, calls Mercury 2
   through OpenRouter when configured, and returns one page-level plan.
4. The content script applies that plan with native setters, bubbling events, combobox selection,
   radio/checkbox handling, file attachment, and dynamic "Other" free-text reveal handling.

The backend returns data only:

```ts
{
  fieldId: "jp-school-select-4",
  action: "select",
  value: "University of Nowhere",
  optionLabel: "Other",
  confidence: 0.82,
  note: "Closest option was missing; selected Other."
}
```

No remote code or model keys are bundled in the extension.

## Tests

```bash
pnpm -F @jobposted/extension test
pnpm -F @jobposted/extension typecheck
pnpm -F @jobposted/shared typecheck
pnpm -F @jobposted/web typecheck
```

Fixtures currently cover Workday, Greenhouse, Lever, Ashby, and generic compact field extraction.
