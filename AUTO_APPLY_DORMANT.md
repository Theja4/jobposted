# Auto-Apply: Dormant (Manual Mode) — Decision & Reactivation Guide

**Decision date:** 2026-06-28
**Decision:** Keep job applying **manual** (you review + click submit via the Chrome extension).
The fully-automatic server "apply robot" is left **dormant** — the code stays in the repo, but it
does not submit anything. This file records why, the current state, and the exact steps to turn full
automation back on later.

> Plain-English summary: nothing is broken. The apply robot is *idle*, not failing, because the only
> account in the system (yours) is in **"review" mode** and there are no other users yet. Captcha is
> **not** the blocker — it appeared once in 22 attempts. Do **not** buy anti-captcha/proxy tools yet.

---

## 1. What is working vs. dormant

| Piece | State | Notes |
|---|---|---|
| **Job fetching** (find new jobs) | ✅ Working | Fixed 2026-06-28: now pulls 51 company boards across the day. See [ingest sharding](apps/ingest/src/run.ts). |
| **Resume tailoring** | ⏸️ Idle | Only runs when an application is queued; nothing is queued today. Not verified working end-to-end. |
| **Auto-submit apply robot** (Railway worker) | ⏸️ Dormant | Code present in `apps/worker`. Does not submit — gated OFF (see §3). |
| **Manual apply** (Chrome extension) | ✅ Working | The extension fills forms on your home computer; you click submit. This is the active path. |

---

## 2. Evidence behind the decision (live data, 2026-06-28)

- **1 user total** in the system (you), `application_mode = review`, not fully onboarded.
- **22 applications ever**, newest created **9 days ago** — the queue is stale because there's no
  active demand.
- Statuses: 15 `ready_for_review`, 3 `failed`, 1 `submitted`, 1 interview, 1 rejected, 1 saved.
- Failure reasons: `"no form fields found"` ×2, `"challenge:recaptcha"` ×1.
- **Captcha hit 1 of 22 attempts.** It is not the bottleneck.
- Tailoring: 0 of 22 had a tailoring delta; 1 had a rendered PDF.

**Conclusion:** the apply robot has nothing to do, and captcha is rare. Building the proxy + captcha
stack now would solve a problem you don't have yet.

---

## 3. How auto-submit is held OFF (the switches)

The Railway worker runs a pipeline every 15 min: prepare → render (tailor) → apply → cleanup
([apps/worker/src/cron.ts](apps/worker/src/cron.ts)). The apply step only submits when **both** of
these environment variables are set on the **Railway** service:

| Env var (on Railway) | Dormant value | Live value | Meaning |
|---|---|---|---|
| `APPLY_RUNNER_ENABLED` | unset / `0` | `1` | Master on/off for the apply robot. |
| `APPLY_DRY_RUN` | unset / `1` | `0` | `1` = practice run (never submits). `0` = really submits. |

There is also a per-user gate: a profile's `application_mode` must be an **auto** mode (not
`review`) for its jobs to be auto-submitted.

So today, auto-submit is off three times over: runner disabled, dry-run default, and the only user is
in review mode. Any one of these being "safe" means nothing gets auto-submitted.

---

## 4. How to REACTIVATE full auto-apply later

Do these in order. Steps 1–2 need the **Railway** dashboard (the server host); 3 is in the product.

1. **Harden the browser first (free, do before going live):** add stealth so the robot looks less
   like a bot — install `playwright-extra` + `puppeteer-extra-plugin-stealth` and use them in
   [apps/worker/src/runner/browser.ts](apps/worker/src/runner/browser.ts), plus the launch flag
   `--disable-blink-features=AutomationControlled`. No monthly cost. Cuts captcha rate a lot.
2. **Flip the Railway switches:** set `APPLY_RUNNER_ENABLED=1`. Keep `APPLY_DRY_RUN=1` for the first
   test so you can watch a "practice" run safely, then set `APPLY_DRY_RUN=0` to submit for real.
3. **Put a test account into an auto mode** (change `application_mode` away from `review`) and
   confirm **one** application goes all the way through before scaling.
4. **Only if captcha actually becomes frequent at volume** (watch `applications.failure_reason` per
   site): add a residential proxy service and a captcha-solver API (2Captcha / CapSolver), wiring a
   solver into the captcha branch of [apps/worker/src/runner/blockers.ts](apps/worker/src/runner/blockers.ts).
   Budget roughly **$30–100/mo**. Detailed blueprint: the captcha report (kept in Gemini Antigravity
   brain, file `captcha_resolution_report.md`).

**Safety net already built:** when the robot hits a captcha, login wall, or closed job, it does NOT
guess — it marks the application `ready_for_review` so you can finish it in seconds via the extension.
That fallback ([blockers.ts](apps/worker/src/runner/blockers.ts)) stays in place.

---

## 5. UI change made with this decision

Removed the **Queue** and **History** buttons from the dashboard top menu
([apps/web/components/dashboard/DashboardNav.tsx](apps/web/components/dashboard/DashboardNav.tsx)),
since those screens are only meaningful once auto-apply is active. **The pages still exist**
(`/dashboard/queue`, `/dashboard/applications`) — they're just hidden from the menu. To bring the
buttons back, re-add their two entries to `NAV_LINKS` (and re-import the `ListChecks` and `Clock3`
icons).

---

## 6. Recommendation while pre-launch

You do not need the apply robot today — you have no users to apply for. Keep applying manually with
the extension (safe, free, no account-flagging risk) and focus on getting users. Come back to §4 when
you have real demand.
