# JobPosted — Production Readiness Gaps & Implementation Plan

> Purpose: a single, self-contained brief that any engineer or LLM can pick up and
> execute. It compiles every gap found in code review (manual + GPT-5.5 pass),
> explains *why* each is a problem, and specifies the target architecture, schema,
> indexing, and rollout order. Where Rezoomed code can be reused, it is called out.
>
> Repo: monorepo — `apps/web` (Next.js), `apps/worker` (Railway), `apps/ingest`
> (job aggregation), `apps/extension` (browser autofill), `packages/shared`,
> `packages/db` (SQL migrations). DB is Supabase Postgres, schema `jobposted`
> (namespaced to coexist with Rezoomed's `public` schema).

## Severity legend

| Tag | Meaning |
|-----|---------|
| **P0** | Blocks launch / breaks the core promise. Must fix before real users. |
| **P1** | Serious quality, scale, or trust issue. Fix before meaningful growth. |
| **P2** | Important polish / hardening. Fix soon after launch. |

## Status snapshot (one-liner per gap)

| # | Gap | Sev | State |
|---|-----|-----|-------|
| 1 | Server-side applying (Playwright runner) not implemented | P0 | Fixed (runner live, dry-run by default; live submit gated by validation) |
| 2 | Matching is shallow (lexical, no semantic stack fit) | P0 | Partially fixed |
| 3 | Embeddings computed + indexed but never used | P0 | Fixed (recall + backfill live) |
| 4 | Matching not efficient at scale (per-user full scan) | P0 | Partially fixed |
| 5 | No real resume rendering / PDF / ATS template / page-fit | P0 | Fixed (PDF+DOCX, page-fit, download) |
| 6 | Base+delta resume model exists in schema, unused at runtime | P0 | Partially fixed |
| 7 | Master-resume swap doesn't pin history (binary overwritten) | P0 | Fixed for new rows |
| 8 | "Don't tailor — use master as-is" toggle missing | P1 | Fixed |
| 9 | Per-application "exact resume sent" not retrievable | P0 | Partially fixed |
| 10 | Two divergent match scores shown to users | P1 | Fixed (relabeled distinct) |
| 11 | Job supply too thin (only GH+Lever, no freshness/expiry) | P1 | Partially fixed (GH+Lever+Ashby, freshness/expiry) |
| 12 | DB indexes too basic for production hot paths | P1 | Fixed |
| 13 | Tracker search caps at 500 rows, filters client-side | P1 | Fixed (RPC-backed search/filter/sort pagination) |
| 14 | Fixture/demo data leaks into real dashboard paths | P1 | Fixed |
| 15 | `documents` table grows unbounded; no TTL/cleanup | P1 | Fixed |
| 16 | Observability not production-grade (console.error only) | P1 | Partially fixed |
| 17 | Same real-world posting duplicated across boards → applied to twice | P0 | Fixed (dedupe_key + apply guard) |

## Implementation progress, 2026-06-15

This pass landed the safe, non-browser-runner hardening work:

- Added `0011_production_hardening.sql` with active resume pointers, immutable resume version metadata,
  job freshness columns, vector recall RPC, and hot-path indexes.
- New resume uploads now use version-scoped storage paths (`{uid}/base/{versionId}.{ext}`), store
  hashes/source metadata, set `profiles.active_resume_version_id`, and can store resume embeddings.
- Queue prep respects the active resume version, records whether tailoring is enabled, pins the master
  resume path when users choose "use master as-is", uses vector recall when a resume embedding exists,
  adds conservative stack/domain blockers, and paginates bulk user prep with bounded concurrency.
- Added an Angular-front-end vs C++ gameplay mismatch regression test.
- Added the "Tailor resumes / Use master resume" preference to onboarding, queue UI, and
  `/api/settings/tailoring`.
- Authenticated dashboard/job-board/history paths no longer fall back to sample data.
- Job board match scores now use the canonical matcher instead of a hash-based fake score.
- Tracker retrieval pages through all of the user's rows instead of hard-capping at 500.
- Extension and manual/job-board tracker rows now pin the active base resume version.
- Extension resume lookup prefers a job-specific tailored resume, then the active base resume.
- Tailored document saves now reuse the existing per-user/per-job document row instead of inserting
  duplicates each time.
- Ingest refreshes `last_seen_at` and marks stale jobs `closed_at` after `INGEST_CLOSE_AFTER_DAYS`.
- Added lightweight web/worker error reporting via `ERROR_REPORTING_WEBHOOK_URL`.
- Reworked the stack/domain gate into a positive, slider-aware fit check (Narrow/Default/Broad):
  weighted *primary*-family detection (immune to "X a plus" noise), cluster-distance gating
  controlled by the fit slider, egregious discipline/systems clashes blocked at every setting,
  and a confidence threshold so thin JDs never starve the queue. Default slider value is now
  "Default" (`higher`), with an example info card in the setup wizard.
- Unified the semantic + lexical paths: when the lexical discipline signal is too thin to
  decide, the gate falls back to a slider-scaled cosine-similarity floor (`SEMANTIC_FLOOR`),
  only when an embedding exists.
- Added the embedding backfill: shared resume-embedding text builder (`@jobposted/shared`),
  reusable batched embedder (`embedInputs`/`jobEmbedText`), a `backfill` CLI
  (`pnpm --filter @jobposted/ingest backfill [-- --jobs|--resumes --limit N]`) for jobs and
  resume versions, and an incremental self-heal step in the ingest cron
  (`INGEST_BACKFILL_LIMIT`, default 200/run). Idempotent (only rows where `embedding IS NULL`).
- Bulk prep now uses keyset pagination on the immutable `user_id` (not offset over a mutable
  `updated_at` sort), so concurrent writes during a run can't skip or duplicate users.
- Two-score fix: the tailor engine's number is now explicitly labeled "Tailoring strength" and
  shown alongside the canonical role-match % in `TailorModal`, so the two can't be confused.
- Real PDF rendering: `lib/tailor/pdf.ts` renders `ResumeContent` to an ATS-clean, single-column,
  text-extractable PDF via `pdf-lib` (standard fonts, comma-listed skills, wrapping + page
  overflow, WinAnsi-safe text). The tailor route now stores a `.pdf`, reuses the per-job document
  row, pins `rendered_pdf_path` + `resume_doc_id` onto the matching application, and the modal
  offers a download. Covered by `lib/tailor/pdf.test.ts`.
- Migration `0011`: pinned `search_path` + explicit `EXECUTE` grants on `match_jobs_for_resume`,
  and dropped the unused per-resume HNSW index.
- Built the server-side apply runner in `apps/worker/src/runner/`: migration `0012` adds
  `attempts`/`claimed_at` + a `claim_applications` RPC (`FOR UPDATE SKIP LOCKED`); the runner
  claims `queued` server apps, gates on each user's daily limit, resolves the applicant + resume
  artifact, fills/submits via per-ATS adapters (Greenhouse, Lever), screenshots, and transitions
  status with retry/backoff + permanent-vs-transient classification. Exposed as a cron-authorized
  `POST /runner/run`, **disabled unless `APPLY_RUNNER_ENABLED=1` and dry-run unless
  `APPLY_DRY_RUN=0`**. Orchestration + policy are unit-tested (20 worker tests); the adapter DOM
  selectors are best-effort and flagged for staging validation before going live.
- Added document retention cleanup: migration `0014_document_retention.sql` adds indexes for
  stale transient document scans and reference checks; the worker now exposes
  `POST /cron/cleanup` and runs cleanup after `POST /cron/run` unless
  `DOCUMENT_CLEANUP_ON_CRON=0`. It prunes only old `tailored_resume` / `cover_letter` rows not
  referenced by applications, then removes only unreferenced `uid/tailored/` or `uid/transient/`
  storage objects.
- Made the auto path end-to-end: added the web render endpoint `POST /api/queue/render`
  (cron-authorized) — it tailors (when enabled + gateway configured) and renders a PDF for queued
  `server` apps with no artifact, pins `rendered_pdf_path` + `resume_doc_id`, idempotent over
  `rendered_pdf_path IS NULL`. The worker `/cron/run` now runs the full pipeline **prepare → render
  → apply → cleanup** (render gated by `QUEUE_RENDER_ON_CRON`, apply by `APPLY_RUNNER_ON_CRON` +
  `APPLY_RUNNER_ENABLED`, still dry-run unless `APPLY_DRY_RUN=0`); `/runner/run` and `/cron/run`
  share one `runApplyFromEnv` helper. So a single scheduled cron hit drives the whole auto path,
  and tailoring-enabled applications now get the tailored PDF rather than the master fallback.
- Cross-board de-dupe (§17): migration `0014` adds `jobs.dedupe_key` (+ index, backfilled to match
  the app's `dedupeKey` canonicalization) and extends `match_jobs_for_resume` to return it; ingest
  populates it on upsert. The matcher now reads the user's already-applied `dedupe_key`s (via an
  `applications → jobs(dedupe_key)` join) and the new pure `dedupeSelect` helper skips any candidate
  whose posting was already applied to on any board, or that repeats within a single run — so the
  same role on a different board/apply_url is never applied to twice. Unit-tested.
- Added server-side tracker search/filter/sort pagination: migration `0018_tracker_search.sql`
  adds trigram/composite indexes plus `tracker_applications_page`; `GET /api/tracker/applications`
  and the tracker board now page/search on the server, export CSV from the filtered result set, and
  avoid the old client-only 500-row cap.
- Added Ashby ingestion (`apps/ingest/src/sources/ashby.ts`) and wired config/CLI/run/docs so the
  public Ashby board API flows through the same normalized upsert path as Greenhouse and Lever.
- Added live ATS validation tooling: `pnpm --filter @jobposted/worker run validate:ats` accepts a
  single URL or matrix file, runs the same adapter validation as `POST /runner/validate`, saves
  optional screenshots, and fails CI on missing selectors/blockers. Blocker detection now catches
  more CAPTCHA/login/Cloudflare patterns, and more common ATS providers are classified as
  review-only instead of unknown/server-safe.
- Added production deployment scaffolding: `Dockerfile.worker`, `railway.toml`, `apps/web/vercel.json`,
  `apps/worker/.env.example`, and `deploy/production.md`.
- Screening-question handling (prevents blank/wrong required answers under the candidate's name):
  added a shared field→answer resolver (`packages/shared/src/field-resolver.ts`, mirrored in the
  worker as `apps/worker/src/runner/field-resolver.ts` since the worker is NodeNext/source-isolated)
  used by BOTH the extension (`resolve.ts`/`profile-value.ts` now delegate to it) and the apply
  runner. The runner now builds the full setup `MasterProfile` (`db.loadMasterProfile`:
  profiles + `profile_answers` + resume content), answers screening fields from it (work auth,
  sponsorship, reusable answers), and — critically — **hard-gates before submit**: it reads the
  live form's actual state and routes the application to `ready_for_review` if any required,
  non-demographic field is still blank, never submitting a blank/wrong answer. EEO/demographics
  are treated as optional (decline-to-answer) and never auto-filled server-side. Unit-tested in
  web + worker (incl. work-auth/sponsorship mapping, the required-unanswered gate, and the
  demographic-optional rule). Two resolver bugs were caught + fixed by the tests
  (work-auth-vs-`country` rule ordering; demographic detection by label when disabled).

Salary + radio/checkbox follow-ups are now done:
- Salary expectations are captured in onboarding (min/max/currency on `profile.workAuth`, persisted
  to `profiles.salary_expectation_*`), exposed in both the extension and server `MasterProfile`
  (`compensation`), and answered via a new `compensation.expected` resolver rule. Blank → still
  routed to review (never guessed). UI: an "Expected salary" row in the setup wizard with a note
  explaining the review-if-blank behavior.
- Radio/checkbox screening controls are now filled: `extractFields` groups radio/checkbox by name
  with the fieldset/legend question label, and a conservative `pickOption` matcher (exact or Yes/No,
  else null) checks the right option. No confident match → left blank → the required-field gate
  routes it to review. Unit-tested (`pickOption`, salary mapping) in web + worker.

Remaining true subsystem work:

- Validate the screening-fill DOM extraction (`extractFields`/`unsatisfiedRequiredFields`/radio
  grouping) against live forms in the staging dry-run — the resolver/gate/matcher decisions are
  unit-tested, but the DOM reading + option clicking are not (and can't be without real forms).

- Validate the apply-runner ATS adapter selectors (Greenhouse/Lever/Ashby) against live forms in a
  staging dry-run, then flip `APPLY_DRY_RUN=0` only for companies that pass.
- Calibrate the `SEMANTIC_FLOOR` thresholds against the real embedding-similarity distribution.
- Expand job ingestion beyond Greenhouse/Lever/Ashby (see §11 for the full source list).
- Optional follow-up to §17: merge duplicate `jobs` rows into one canonical row at upsert (reduces
  row count); the apply-time guard already prevents the double-apply outcome regardless.

The PDF/DOCX renderer with page-fit is now implemented: `lib/tailor/pdf.ts` lays content out as
measurable blocks, estimates a target page count from experience span + content volume, and
binary-searches a density scale that packs content to just under the target boundary (condense a
1.x-page resume to one page; expand a near-two-page resume to fill two; no orphan trailing lines).
`lib/tailor/docx.ts` emits an ATS-friendly editable `.docx`. The tailor route stores both and the
modal offers PDF + DOCX downloads. Covered by `lib/tailor/pdf.test.ts`.

---

## 1. (P0) Server-side applying is not implemented

**Status.** Fixed in the codebase, with a deliberately conservative launch gate. The Railway
worker now exposes the apply runner and the full `prepare → render → apply → cleanup` cron path,
but stays dry-run unless `APPLY_DRY_RUN=0`.

**Implemented.**
- Atomic queue claiming via `claim_applications` (`FOR UPDATE SKIP LOCKED`).
- Status transitions through `queued → submitting → submitted | ready_for_review | failed`.
- Per-user daily-limit gates, retry/backoff, permanent failure classification, screenshots.
- Server-safe adapters for Greenhouse, Lever, Ashby.
- Review-only classification for common login-gated or fragile ATS flows.
- `POST /runner/validate` and `pnpm --filter @jobposted/worker run validate:ats` for live selector
  validation before submit is enabled.

**Remaining launch gate.** Run live validation on the first target company set, inspect dry-run
screenshots, then enable `APPLY_DRY_RUN=0` only for validated server-safe adapters.

**Auth/ToS note:** server-side auto-apply has real account-safety and ATS-ToS implications. Keep
review as the safe default and keep login-gated providers in the extension/manual path.

---

## 2. (P0) Matching is too shallow — no semantic stack/domain fit

**Problem.** The daily matcher scores jobs with **lexical** signals only: title word
overlap ratio + substring keyword/skill checks. There is no semantic understanding,
so an Angular front-end engineer can pass for an unrelated C++ game role when the
title ("Software Engineer"), location, job type, and a few generic keywords line up.

**Evidence.**
- `apps/web/lib/apply/matcher.ts:135` `overlapRatio` — plain word-overlap.
- `apps/web/lib/apply/matcher.ts:260` `matchedSkillScore` — `includesPhrase` substring
  matching; generic skills (git, agile, sql, api) match almost any JD.
- `apps/web/lib/apply/matcher.ts:308-323` — title gate passes at overlap `≥ 0.34`,
  worth up to 35/100; title dominates the score.
- No hard blocker for stack/domain mismatch anywhere in `scoreJobForConfig`.

**Impact.** Low-quality matches → wasted daily application budget, irrelevant
applications sent under the user's name, eroded trust. This is the single most
important quality gap.

**Solution / architecture.** Two-stage scoring:
1. **Semantic recall (cheap, in-DB):** cosine similarity between a **profile/resume
   embedding** and the **job embedding** using the existing pgvector HNSW index
   (`0004_indexes.sql:24`). This is where §3 is fixed — embeddings already exist but
   are unused. Use it to retrieve the top-N most relevant jobs per user *in SQL*,
   not in app memory (also fixes §4).
2. **Structured re-rank + hard gates (precise):** on the recalled set, apply:
   - **Hard blockers** that must never pass: stack/domain conflict (e.g. a
     skills/tech taxonomy where `angular`/`react`/`frontend` vs `c++`/`unreal`/
     `gameplay` are mutually exclusive families), seniority mismatch beyond a band,
     job-type mismatch, location/work-auth mismatch, excluded company/keyword.
   - **Soft score** that blends cosine similarity (dominant weight), title role-family
     match, must-have skill coverage, and recency.
   - Maintain a small curated **skill/stack ontology** (families + aliases) so
     "Angular ≠ C++ gamedev" is a deterministic rule, not an LLM guess. Seed it from
     the skills users actually have + common JD vocabulary.
3. **Optional LLM judge** only for borderline scores (e.g. 55–70 band) to keep cost
   bounded — never run the LLM on the full candidate set.

**Acceptance:** a curated eval set of (resume, job, expected verdict) pairs —
including the Angular-vs-C++ case — must pass before this ships. Keep the eval in
`apps/web/lib/apply/matcher.test.ts` (a stub already exists).

---

## 3. (P0) Embeddings are computed, stored, and indexed — but never used

**Problem.** Every job is embedded (OpenAI `text-embedding-3-small`, 1536-dim),
stored in `jobs.embedding`, and backed by an HNSW cosine index. **Nothing reads
them.** `resume_variants.jd_centroid` is likewise never populated or queried.

**Evidence.**
- Embedding generation: `apps/ingest/src/embed.ts:13-67`.
- Column + HNSW index: `packages/db/migrations/0001_schema.sql:64`,
  `packages/db/migrations/0004_indexes.sql:24`.
- Zero reads: a repo-wide search for `embedding` / `<=>` / `jd_centroid` / `.rpc(`
  in `apps/web` finds no query usage.

**Impact.** Paying for embeddings + maintaining a vector index for zero benefit, while
the matcher (§2) does the worse, lexical thing instead.

**Solution.** Wire embeddings into matching (§2). Add a Postgres RPC (SQL function)
`jobposted.match_jobs(profile_embedding vector, filters…, limit int)` that does the
ANN search + cheap SQL-side filters and returns ranked candidates. Embed the user's
resume/profile once per resume version (store on `resume_base_versions`, see §6) and
reuse it. If embeddings are genuinely not wanted, delete the column/index/ingest step
so it isn't dead spend — but the recommendation is to **use** them.

---

## 4. (P0) Matching is not efficient at scale

**Problem.** For each user the matcher reads 500–1000 job rows **including the full
`description_md`**, scores them in app memory, and loops users **sequentially**.

**Evidence.**
- `apps/web/lib/apply/matcher.ts:458-486` `readCandidateJobs` — pulls up to `limit`
  rows with `description_md`.
- `apps/web/lib/apply/matcher.ts:550-562` — per-user fetch + in-memory scoring.
- `apps/web/lib/apply/matcher.ts:654-690` `prepareDailyApplicationsForAllUsers` —
  sequential `await` per user; `userLimit` capped at 500 with no pagination.

**Impact.** ~1000 users × ~1000 candidates ≈ 1M scans/run *before* tailoring, plus
massive redundant IO (same job set + full descriptions re-fetched per user). Won't
hold under growth; the 500-user cap silently drops users beyond it.

**Solution.**
- Push candidate selection + scoring into SQL via the `match_jobs` RPC (§3): each user
  gets top-N candidates from the ANN index without dragging full descriptions into Node.
- Do **not** select `description_md` for scoring; fetch it lazily only for the small set
  that will actually be tailored/applied.
- Process users in **batches with bounded concurrency** (e.g. `p-limit`), and
  **paginate** through all eligible users (remove the silent 500 cap; loop until done).
- Consider a per-run "candidate snapshot" (fresh jobs since last run) so each run scores
  new inventory, not the whole table.

---

## 5. (P0) No real resume rendering — no PDF, no ATS template, no page-fit

**Problem.** Resumes are HTML only. There is **no PDF/DOCX generation**, no print
template, and **zero page-fitting logic**. The "Download" button even saves an
`.html` file renamed from `.pdf`.

**Evidence.**
- `apps/web/lib/tailor/render.ts:13-69` — web layout (`max-width:720px`, box-shadow,
  colored skill pills, flexbox title/date rows). No `@page`, A4/Letter, margins, or
  `page-break-inside: avoid`. The colored pills + two-column flex rows are also
  **risky for strict ATS text extraction** despite the "ATS-clean" comment.
- `apps/web/components/dashboard/ResumeViewer.tsx:107` — download writes `.html`.
- No `puppeteer`/`playwright`/`pdf-lib`/`react-pdf` anywhere in `apps/web`.

**Required behavior (employer-grade output).**
- **Real PDF (and ideally DOCX)** output, A4 + Letter, proper margins.
- **ATS-safe template:** single logical column for parse order, real text (no text in
  images), standard section headings, no background-filled pills as the only signal,
  selectable/extractable text.
- **Page-fit engine** (the explicit product requirement):
  - Never leave 1–3 orphan lines spilling onto a trailing page ("one word on page 2"
    is unacceptable).
  - If content is ~1.1–1.5 pages: condense to a clean 1 page **via density** (font
    size within a safe range, line-height, section spacing, margins) before trimming
    content.
  - If content meaningfully exceeds 1 page and the candidate has the substance
    (e.g. ≥ ~3 years experience): expand to fill **2 full pages** cleanly rather than
    1.3 pages — again via spacing/format first.
  - `< ~3 years` experience: target a single, full page.
  - Adjust **template/spacing/format first**, content length last. Measure rendered
    height (headless Chromium) and iterate to the nearest clean page boundary.
- **WYSIWYG:** the on-screen preview and the file submitted to the employer must be the
  **same bytes** rendered from the same template (today the preview uses sample data —
  see §9).

**Reuse from Rezoomed.** `apps/web/lib/rezoomed-resume-parser/*` already parses
PDF/DOCX into structured data (`pdfExtractor.ts`, `docxTextExtractor.ts`,
`resumeParser.ts`, `parserConfidence.ts`). Reuse it for **ingesting** the user's
uploaded master into the structured `ResumeContent`. For **output**, build a proper
print renderer (headless Chromium → PDF, or Rezoomed's PDF pipeline if one exists in
that codebase — port it). Keep one canonical `ResumeContent` → template → PDF path so
preview and submission can never diverge.

---

## 6. (P0) Base+delta resume model exists in schema but is unused at runtime

**Problem.** The schema is designed for scale (store a base + per-variant/per-job
deltas, not hundreds of PDFs), but the runtime ignores it: queue rows insert
`resume_variant_id`, `tailoring_delta`, and `rendered_pdf_path` as `null`.

**Evidence.**
- Tables: `packages/db/migrations/0001_schema.sql:70-112`
  (`resume_base_versions`, `resume_variants`, `applications.tailoring_delta`).
- `apps/web/lib/apply/matcher.ts:581-595` — all of these set to `null`.
- `resume_variants` is never written or read anywhere.

**Impact.** Re-tailoring is full re-render every time; no variant reuse; the
"deltas not PDFs" storage win is unrealized. At 20 apps/day × 30 days = 600
applications/user, ×1000 users this matters.

**Solution / architecture (canonical resume model).**
- `resume_base_versions` = append-only source of truth (structured `ResumeContent`
  JSON) + a stored **embedding** per version (for §3) + the version-scoped binary path
  (see §7).
- `resume_variants` = a JD-cluster-level delta vs a base version (summary/skills order/
  keyword emphasis), keyed by `base_version_id` + `jd_centroid`. Reuse a variant across
  similar JDs (cluster by cosine distance) instead of tailoring every job.
- `applications.tailoring_delta` = the small per-job tweak on top of the variant.
- Reconstruct any sent resume deterministically: `base_version + variant_delta +
  per_job_delta → ResumeContent → template → PDF`. Render the PDF once, store it
  (§9), and pin it to the application.

---

## 7. (P0) Master-resume swap does not pin history; the binary is overwritten

**Problem.** A user who applied to 500 jobs on master v1, then uploads v2, loses the
ability to retrieve the exact v1 file. Structured version JSON survives (append-only),
but the **binary file is a single overwritten blob** and version pinning is
inconsistent.

**Evidence.**
- `apps/web/app/api/profile/resume/route.ts:50-53` — upload path is
  `${user.id}/base.${ext}` with `upsert: true` → **every upload overwrites the prior
  binary**, and all historical `base_resume` `documents` rows point at that one path.
- `apps/web/app/api/profile/resume/route.ts:88-92` — version JSON is `insert` (good,
  append-only).
- Pinning is partial: only the matcher sets `base_version_id`
  (`apps/web/lib/apply/matcher.ts:588`); the tracker route leaves it null
  (`apps/web/app/api/tracker/applications/route.ts:234`).

**Impact.** Cannot reproduce what was actually sent for past applications; a master
swap effectively rewrites history. Users may change the master many times a day — this
must be safe.

**Solution / architecture.**
- **Version-scoped binaries:** store each upload at `${uid}/base/${versionId}.${ext}`;
  never overwrite. Every version's exact file is retained.
- **Immutable per-application pinning on every path** (matcher, tracker, extension,
  auto-runner): freeze `base_version_id` + `resume_variant_id` + `tailoring_delta` +
  `rendered_pdf_path` at apply time. Changing the master must **never** mutate existing
  application rows.
- **Active-master pointer:** add `profiles.active_resume_version_id` so "use this one
  going forward" is an explicit, reversible choice (not last-insert-wins). Users can
  switch freely; only future applications use the new active version.
- **Dedup + retention:** skip inserting a new version if content is byte-identical to
  the current; allow pruning only of versions **not referenced by any application**.

---

## 8. (P1) Missing "don't tailor — use my master resume as-is" toggle

**Problem.** The product assumes tailoring. There is no user control to send the same
master resume to every application.

**Evidence.** Preference model has `applicationMode` (auto/review) only
(`apps/web/lib/onboarding/model.ts:83-90`); no tailoring on/off flag. The existing
`ModeToggle` (`apps/web/components/dashboard/ModeToggle.tsx`) + `/api/settings/mode`
are the pattern to mirror.

**Solution.**
- Add `final.tailorResume: boolean` (default `true`) to `OnboardingConfig`
  (`model.ts` default + `sanitizeOnboardingConfig`). No DB migration needed — it lives
  in the onboarding config JSON the matcher already loads.
- Add `/api/settings/tailoring` mirroring `/api/settings/mode`.
- Add a toggle in the queue UI (mirror `ModeToggle`) and surface it in settings.
- Enforcement: when `tailorResume = false`, the apply pipeline (§1/§5/§6) renders the
  PDF straight from the active base version (no variant/delta), still version-pinned per
  application. Record the choice in `field_map` per application for auditability.

---

## 9. (P0) The exact resume sent is not retrievable in history

**Problem.** The tracker/history "View resume" shows generic **sample data**, not the
resume that was actually sent. Auto/queued applications attach no resume at all.

**Evidence.**
- `apps/web/components/dashboard/ResumeViewer.tsx:21` — `buildResumeHtml` renders from
  `MASTER_PROFILE` (hardcoded sample), ignoring any stored document.
- `apps/web/lib/apply/matcher.ts:586` — applications created with `resume_doc_id: null`,
  `rendered_pdf_path: null`.
- The extension fills the user's **base** resume signed URL
  (`apps/web/app/api/extension/resume/route.ts:15`), not a per-job tailored render.

**Impact.** Users can't verify what was sent; "what you see" ≠ "what you got" ≠ "what
the employer received."

**Solution.** Tie it all together with §5/§6/§7: render the PDF at apply time, store at
`${uid}/applications/${applicationId}.pdf`, set `applications.rendered_pdf_path` +
`resume_doc_id`, and make "View resume" load **that file** (signed URL) instead of
`MASTER_PROFILE`. Same artifact for preview, download, history, and submission.

---

## 10. (P1) Two divergent match scores shown to users

**Problem.** The lexical matcher produces one `matchScore` (stored in `field_map` and
shown in the queue/tracker), while the LLM tailor returns its **own** `matchScore`.
They disagree.

**Evidence.**
- Matcher score: `apps/web/lib/apply/matcher.ts:376` → stored in `field_map.matchScore`
  (`:604`), read for display in `apps/web/lib/dashboard/applications.ts:52`.
- Tailor score: `apps/web/lib/tailor/engine.ts:129`.

**Impact.** Inconsistent, confusing numbers undermine trust in the match quality.

**Solution.** Define **one** canonical fit score (the semantic+structured score from
§2) used everywhere. The tailor's self-assessment can remain as a separate, clearly
labeled "tailoring strength" if useful, but the headline "match %" must be singular and
consistent across queue, tracker, and history.

---

## 11. (P1) Job supply is too thin; no freshness/expiry

**Problem.** Ingest pulls configured Greenhouse, Lever, and Ashby boards. This is materially
better than the original two-source state, but still too narrow for sustained volume across many
roles, geos, and industries.

**Evidence.**
- `apps/ingest/src/config.ts`, `apps/ingest/src/run.ts` — GH + Lever + Ashby are wired.
- Seed `packages/db/seed/board_tokens.example.json` — still only a starter board list.
- Dedupe ranks reference Ashby/Workable/aggregators (`packages/shared/src/dedupe.ts`)
  but Workable/SmartRecruiters/aggregator fetchers are not wired yet.

**Impact.** Can't sustain 20 fresh, relevant apps/day across many users; the matcher
draws from the newest ≤1000 jobs **globally shared** across all users, so niches get
exhausted and the same jobs recur. Stale postings get applied to.

**Solution.**
- Add more first-party ATS fetchers (Workable, SmartRecruiters, Recruitee) reusing the
  existing source pattern; add an aggregator/search provider for breadth.
- Continue enforcing **freshness**: `last_seen_at`, mark jobs not seen in N runs as `closed`, and
  exclude closed/expired jobs from matching + applying.
- Grow the board list materially; consider per-vertical board sets.
- Validate `apply_url` health before applying (dead links → skip + flag).

### Catalog of fetchable job sources

**Tier 1 — direct ATS public JSON feeds (no API key; board token / company slug; auto-apply-able
via the runner because the apply URL is the real ATS form):**
- Greenhouse — `boards-api.greenhouse.io/v1/boards/<token>/jobs` ✅ implemented
- Lever — `api.lever.co/v0/postings/<company>` ✅ implemented
- Ashby — `api.ashbyhq.com/posting-api/job-board/<org>` ✅ implemented
- SmartRecruiters — `api.smartrecruiters.com/v1/companies/<id>/postings`
- Workable — `<account>.workable.com/spi/v3/jobs` (or `apply.workable.com/api/v1/widget/accounts/<id>`)
- Recruitee — `<company>.recruitee.com/api/offers`
- Teamtailor, Personio, JazzHR, BambooHR (`<co>.bamboohr.com/jobs/embed2.php`), Jobvite, Rippling,
  Paylocity — all expose per-tenant public JSON or scrapeable boards.
- Harder per-tenant (need tenant discovery, messier JSON): Workday (`<tenant>.<dc>.myworkdayjobs.com
  /wday/cxs/.../jobs`), iCIMS, Taleo, Oracle/SuccessFactors.

**Tier 2 — aggregator / search APIs (key or paid; breadth across many companies; apply URLs are
often redirects → better for discovery + the extension path than blind auto-submit):**
- Adzuna API (free tier), JSearch via RapidAPI (aggregates Google for Jobs / LinkedIn / Indeed /
  Glassdoor), SerpApi Google Jobs, Apify scrapers (LinkedIn/Indeed/Glassdoor), Jooble, The Muse,
  Findwork, Reed (UK), Arbeitnow.

**Tier 3 — free niche/remote boards (open APIs, good for remote-heavy users):**
- Remotive, RemoteOK, Arbeitnow, USAJobs (US government, free key), We Work Remotely (RSS),
  Hacker News "Who is hiring" (parse).

**Not officially fetchable (ToS-restricted; only via Tier-2 aggregators/scrapers):** LinkedIn and
Indeed have no open job API — never scrape them directly under our own identity; go through a
compliant aggregator.

> Strategy: lean on **Tier 1** for the auto-apply pipeline (direct ATS forms the runner can fill),
> and **Tier 2/3** for discovery breadth surfaced in the job board + extension. Every source must
> flow through cross-board de-duplication (§17) before it can be queued.

---

## 12. (P1) DB indexes too basic for production hot paths

**Problem.** Current indexes cover only the simplest paths. Several production hot
queries have no supporting composite index.

**Evidence.** `packages/db/migrations/0004_indexes.sql:5-26` —
`applications(user_id, submitted_at)`, `applications(status)`, simple `jobs` indexes,
HNSW embedding. Missing composites for queue claiming, dashboard filtering, tracker
ordering, and per-user status.

**Solution (new migration, e.g. `0010_indexes.sql`).** Add, verified with `EXPLAIN`:
- **Queue claim:** partial index for the runner's claim query, e.g.
  `applications(status, created_at) WHERE status = 'queued'` (+ use
  `FOR UPDATE SKIP LOCKED`).
- **Per-user status / dashboard:** `applications(user_id, status, submitted_at desc)`.
- **Tracker ordering (§13):** `applications(user_id, submitted_at desc, created_at desc)`.
- **Candidate read sort:** `jobs(posted_at desc, ingested_at desc) WHERE apply_url is
  not null` — the current sort (`matcher.ts:481`) has no matching composite and pulls
  large rows.
- **Existing-application lookup:** ensure `applications(user_id, job_id)` is covered
  (unique constraint exists; confirm it serves the `in (...)` check at
  `matcher.ts:488`).
- Keep the HNSW embedding index — once §3 uses it, it earns its keep.

---

## 13. (P1) Tracker search won't scale (500-row cap, client-side filter)

**Status.** Fixed. Tracker search, filters, sort, pagination, summary counts, and CSV export now
use the server/API path instead of filtering the latest 500 rows in the browser.

**Implemented.**
- `0018_tracker_search.sql` adds composite indexes plus trigram indexes over application text,
  job title, company, and location.
- `tracker_applications_page` returns filtered rows plus `total_count`.
- `GET /api/tracker/applications` exposes query/source/stage/sort/limit/offset.
- `JobTrackerBoard` debounces search, loads pages incrementally, refreshes after mutations, and
  exports CSV from the filtered server result.

---

## 14. (P1) Fixture/demo data leaks into real dashboard paths

**Problem.** Sample data appears in production paths and can mislead users into
thinking work happened that didn't.

**Evidence.**
- `apps/web/lib/dashboard/applications.ts:193` — "queue tomorrow" is always sample data
  (`QUEUE_TOMORROW`).
- `apps/web/lib/dashboard/jobs.ts:150,158` — job board returns sample `JOBS` on DB
  error **or** when empty.
- `apps/web/components/dashboard/ResumeViewer.tsx:21` — sample resume (also §9).

**Solution.** Replace all sample fallbacks with real empty/loading/error states. On DB
error, show an explicit error (and log/report it, §16) — never silently substitute
fake rows. Keep `sample-data.ts` for the marketing/landing showcase only, not the
authenticated dashboard.

---

## 15. (P1) `documents` table grows unbounded; no TTL/cleanup

**Status.** Fixed for new rows and backed by a worker retention cleanup.

**Original problem.** Every tailor-with-save inserted a new `documents` row even when the
underlying storage file was overwritten, creating duplicate/orphaned rows. There was no
retention policy on tailored artifacts.

**Evidence.**
- `apps/web/app/api/tailor/route.ts:70-93` — `insert` (not upsert) per save; tailored
  HTML upserted to a per-job path so re-tailoring orphans prior `documents` rows.
- No TTL/cleanup job anywhere.

**Implemented solution.** Per-application tailored saves now reuse the canonical
document row. Migration `0014_document_retention.sql` adds cleanup indexes, and the
worker exposes `POST /cron/cleanup` plus an automatic bounded cleanup after
`POST /cron/run`. The cleanup only considers old `tailored_resume` / `cover_letter`
rows, preserves anything referenced by applications, and removes storage objects only
after confirming they are unreferenced by `documents`, `applications.rendered_pdf_path`,
and `resume_base_versions`.

---

## 16. (P1) Observability is not production-grade

**Problem.** Errors mostly go to `console.error`. Sentry is only detected as an env
flag in the worker health check, not wired to capture/report.

**Evidence.** `apps/worker/src/health.ts:20` — env-flag detection only; no real capture.
Widespread `console.error` across API routes.

**Solution.** Wire real error reporting (Sentry or equivalent) in `apps/web` and
`apps/worker`: capture API route errors, matcher/runner failures, ingest failures, and
gateway/embedding errors with context (user id, job id, run id). Add structured logging
and basic run metrics (jobs ingested, candidates scored, applications prepared/
submitted/failed). Alert on cron failure and on submission failure-rate spikes.

---

## 17. (P0) The same real-world posting can be applied to twice

**Problem.** A single role is routinely posted to several boards/aggregators (e.g. a company's
Greenhouse board *and* LinkedIn *and* an aggregator). Each becomes a distinct `jobs` row (different
`source` / `source_job_id`, so the `unique (source, source_job_id)` constraint doesn't catch it),
with a different `apply_url`. Nothing stops the matcher from queuing **both**, so the user applies
to the same job twice — wasting their daily quota and looking spammy to the employer.

**Evidence.**
- `dedupeJobs` in `packages/shared/src/dedupe.ts` collapses on normalized `(company, title,
  location)` — but it only runs **within a single ingest batch in memory**
  (`apps/ingest/src/run.ts`). It does not dedupe across ingest runs or across sources persisted at
  different times, so cross-board/cross-run duplicates land as separate rows.
- `applications` has `unique (user_id, job_id)` — that prevents re-applying to the *same row*, not
  to two rows that are the *same real posting*.
- The matcher (`apps/web/lib/apply/matcher.ts`) and `readExistingJobIds` de-dupe by `job_id` only.

**Impact.** Duplicate applications to one role; quota burned on redundant submissions; worse
candidate experience. P0 because it directly produces a bad, visible outcome under the core flow.

**Solution / architecture.**
1. **A stable posting identity on `jobs`.** Add a `dedupe_key` (or `canonical_id`) column =
   `dedupeKey(company, title, location)` (reuse `packages/shared/src/dedupe.ts`), populated at
   ingest/upsert and backfilled. Optionally strengthen with a description-shingle similarity check
   (`descriptionSimilarity`, already in the same module) to merge near-identical postings and avoid
   false merges of distinct same-title roles.
2. **Global dedupe at upsert.** When upserting, look up existing rows by `dedupe_key`; merge into
   the most-direct `apply_url` (the dedupe module already ranks ATS/source directness) instead of
   inserting a parallel row. Keep the richest description + fullest question set.
3. **Apply-time guard.** Before queuing/claiming, exclude jobs whose `dedupe_key` matches any the
   user has *already* applied to — not just the same `job_id`. i.e. `readExistingJobIds` becomes
   "existing applied `dedupe_key`s for this user". This is the safety net even if two rows survive.
4. **Index** `jobs (dedupe_key)` and include it in the candidate query so the guard is cheap.

This closes the loop: one canonical posting per role, and a per-user "already applied to this
posting" check that's immune to the same job arriving via a different board.

---

## Target architecture (how the pieces fit)

```
Ingest (apps/ingest)
  fetch (GH/Lever/Ashby/Workable/aggregator)
   → normalize → dedupe (packages/shared)
   → embed job (text-embedding-3-small, 1536d)
   → upsert jobs (+ last_seen_at, freshness/closed handling)

Resume model (canonical)
  upload master → Rezoomed parser → ResumeContent (structured)
   → resume_base_versions (append-only, + embedding, + version-scoped binary)
   → profiles.active_resume_version_id (explicit current master)

Matching (per user, in SQL)
  match_jobs RPC: ANN (job.embedding <=> profile.embedding) + cheap filters
   → top-N candidates (no description_md pulled)
   → structured re-rank + HARD stack/seniority/location gates (ontology)
   → single canonical fit score

Tailoring / rendering
  if tailorResume: base + variant(delta per JD cluster) + per-job delta
  else:            base as-is
   → ResumeContent → ATS-safe print template → page-fit engine → PDF (+DOCX)
   → store at applications/{id}.pdf, pin rendered_pdf_path + base_version_id

Apply
  review mode: user releases batch
  auto mode:   Playwright runner claims queued rows (FOR UPDATE SKIP LOCKED),
               submits via per-ATS adapters, records submitted_at/screenshot,
               enforces daily_limit, attaches the pinned PDF

Cross-cutting
  indexes (§12), server-side tracker search (§13), real empty states (§14),
  retention/cleanup (§15), error reporting + metrics (§16)
```

## Suggested execution order

**Phase 0 — correctness of what's shown (fast, high trust).**
- §9 + §14: render/pin the real per-application resume; remove sample-data leaks.
- §10: collapse to one canonical match score.

**Phase 1 — matching quality + efficiency (core promise).**
- §3 + §2 + §4: `match_jobs` RPC, semantic recall, hard stack gates, batched/paginated
  bulk run, ontology + eval set.
- §12: add the supporting composite indexes.

**Phase 2 — resume engine at scale.**
- §5 + §6 + §7 + §8: ATS PDF/DOCX renderer + page-fit engine, base/variant/delta wiring,
  version-scoped binaries + active-master pointer + immutable pinning, tailor on/off
  toggle, §15 retention.

**Phase 3 — actually apply + supply + ops.**
- §1: Playwright submission runner (port extension adapters).
- §11: more ATS sources + freshness/expiry.
- §13: server-side tracker search/pagination.
- §16: real observability + alerting.

## Notes for the implementer

- **Reuse, don't rewrite:** Rezoomed parser (`apps/web/lib/rezoomed-resume-parser/*`)
  for master ingestion; extension adapters/autofill
  (`apps/extension/src/adapters/*`, `.../autofill/*`) for the server apply runner.
- **Schema namespace:** everything lives in the `jobposted` schema (not `public`),
  shared DB with Rezoomed — keep new tables/indexes/RPCs namespaced.
- **Honesty guardrails already exist** in the tailor engine
  (`apps/web/lib/tailor/engine.ts`: no fabricated numbers/skills, prompt-injection
  defense) — preserve them in any rewrite.
- **Validate every index with `EXPLAIN (ANALYZE)`** against realistic row counts
  (≥600 applications/user, ≥100k jobs) before merging.
- **Add evals** for matching (incl. Angular-vs-C++) and snapshot tests for the page-fit
  engine (1-page vs 2-page boundary cases) so regressions are caught.
