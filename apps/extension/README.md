# JobPosted Chrome Extension

Manifest V3 extension for login-gated job applications. The extension fills ATS forms inside the user's authenticated Chrome session, attaches the JobPosted/Rezoomed resume, stops at final Submit by default, and syncs the fill record back to the JobPosted dashboard.

## Stack

- WXT, Manifest V3, TypeScript
- React 19 for popup, options, and the in-page shadow-DOM overlay
- Tailwind CSS v4 via `@tailwindcss/vite`
- `@jobposted/shared` for profile, application sync, settings, and message types
- Supabase session reuse through the JobPosted web app bridge

## Environment

Create `apps/extension/.env.local` for local development:

```bash
WXT_JOBPOSTED_WEB_ORIGIN=http://localhost:3000
WXT_SUPABASE_URL=...
WXT_SUPABASE_ANON_KEY=...
WXT_INCLUDE_LOCALHOST=1
```

Extension builds default to `https://jobposted.app`. For local development, set
`WXT_JOBPOSTED_WEB_ORIGIN=http://localhost:3000` and `WXT_INCLUDE_LOCALHOST=1`. The service-role key
and AI/model keys are never bundled into the extension.

The web app routes use:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AI_GATEWAY_API_KEY=...        # optional, for ambiguous field mapping
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1
AI_GATEWAY_MODEL=openai/gpt-5-mini
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
  `WXT_JOBPOSTED_WEB_ORIGIN=http://localhost:3000` and `WXT_INCLUDE_LOCALHOST=1`.
- Application sync is durable: transient network/server failures are stored in
  `chrome.storage.local`, retried with `chrome.alarms`, and shown in the popup as pending syncs.
- Filled-but-not-submitted extension records do **not** set `submitted_at`, so they do not count
  against paid daily application limits.
- The web app exposes `GET /api/health` for deployment monitoring and uses
  `AI_GATEWAY_TIMEOUT_MS` to cap ambiguous field-mapping calls.
- `Fill & Continue` respects the `autoAdvance` option, and auto-submit only clicks Submit when
  every detected field is safe, with no `failed` or `needs_user` records.

## Autofill Architecture

- `entrypoints/background.ts`: session storage, refresh, settings, API proxy, application sync.
- `entrypoints/content.tsx`: supported-host content script, session bridge listener, shadow overlay, fill runner.
- `src/autofill/*`: platform-agnostic field discovery, canonical matching, React-safe value setting, file upload attachment.
- `src/adapters/*`: thin ATS adapters that provide match rules, stable selector hints, step detection, Next/Submit controls, and maintenance notes.

## Adding An Adapter

1. Add a file in `src/adapters/<platform>.ts`.
2. Implement `PlatformAdapter`:
   - `match(url, dom)`
   - `detectStep(dom)`
   - `mapFields(dom)` with stable selectors mapped to canonical keys
   - `findAdvance(dom)`
   - `findSubmit(dom)`
   - `notes`
3. Export it from `src/adapters/index.ts` before `makeGenericAdapter()`.
4. Add a small DOM fixture under `src/fixtures/`.
5. Add/extend `src/autofill/field-resolution.test.ts`.
6. Add the host to `ATS_HOSTS` in `wxt.config.ts` only if it is a named supported domain.

Do not add `<all_urls>`. Unknown forms are handled by the generic fallback only when the host is already in the permission list and the user enables fallback in options.

## Field Mapping And LLM Cache

Resolution order:

1. Adapter selector hints.
2. Label, ARIA, placeholder, surrounding text, fieldset legend, and options.
3. Normalized canonical rules (`identity.firstName`, `workAuth.requiresSponsorship`, `documents.resume`, etc.).
4. Reusable answers from `jobposted.profile_answers`.
5. Background-brokered `/api/extension/field-map`, which checks `jobposted.extension_field_mappings` before optionally calling Vercel AI Gateway.

The backend returns data only:

```ts
{
  canonicalKey: "answers.notice_period",
  value: "Two weeks",
  confidence: 0.82,
  source: "llm"
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

Fixtures currently cover Workday, Greenhouse, Lever, Ashby, and generic fallback field resolution.
