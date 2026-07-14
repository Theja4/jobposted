# ENGINE — the July revenue machine (parked, resume with "engine")

*Saved 2026-07-04. Goal: $2,000 this month from existing assets, faceless. This doc is self-contained — everything needed to execute without re-reading the research conversation.*

## Thesis

$2K in <30 days with no audience = sell things people pay for immediately (productized service + lifetime deals) to prospects who are publicly enumerable. Subscriptions compound too slowly; a new product has no distribution. The two assets that already exist (JobPosted, Rezoomed) plus one service offer are the whole plan.

## Track 1 — Launch service (the main engine)

**Offer:** "$199–299 Launch Pack" for newly launched apps: submission to ~150 vetted directories with screenshot proof per listing + fix the audit issues we found + indexing hygiene (IndexNow, sitemap, GSC) + 2 comparison pages. Optional $299–499/mo "launch ops" retainer for agencies that ship client MVPs monthly.

**Why it works now:** ~235K new vibe-coded apps submitted in Q1 2026 (+84% YoY), built by non-marketers. Validated competitors: ListingBott ($299 beta → $999 planned, DR 0→15 guarantee), SubmitSaaS (~$45–105), SubmitWell etc. We differentiate on: (a) the JobPosted autofill engine repurposed as the submission agent — near-zero marginal cost vs their VAs, (b) screenshot-proof reporting (documented ListingBott weakness), (c) audit-led outreach nobody else does.

**Unfair advantage #2:** the SEO tool suite generates a genuine 1-page audit per prospect — that IS the cold email. Personalized value at scale, no face, no audience.

### The machine to build (days 1–3)

1. **Prospect scraper** — daily pull: Product Hunt launches, Show HN, r/SideProject, BetaList, IndieHackers products. Extract: product URL, founder handle/email (site contact, GitHub, X). Target ~30/day → ~600/mo.
2. **Audit generator** — for each prospect domain, auto-run: meta/OG check, sitemap/robots, indexation ("site:domain" + brand query), backlink count (free sources), CWV quick pass, schema presence. Output: branded 1-page PDF/HTML.
3. **Outreach kit** — template: "Ran an audit on {app} — {N} issues + 0 backlinks (attached). We fix + submit to 150 directories with proof screenshots in 7 days. $199." + follow-up sequence + simple tracker (sheet or SQLite).
4. **Service one-pager** — offer, proof (dogfood JobPosted through the pipeline as case study #1), Stripe/LemonSqueezy checkout.
5. **Delivery pipeline** — directory list (curate 150 from free GitHub lists + our own), submission agent (adapt autofill content script), proof screenshots, per-client report.

**Math:** 600 prospects → ~40% contactable → ~240 sends → 3–5% close = 7–12 clients × $199–299 ≈ **$1,400–2,900**.

**Honesty guardrails (keep the offer clean):**
- No "guaranteed Google indexing" claims. Google's Indexing API is officially JobPosting/BroadcastEvent-only, with spam detection and multi-account bans. Sell indexing *hygiene* (IndexNow for Bing/Yandex, sitemaps, GSC submission, internal links).
- No fake reviews, no PBN spam, no Reddit astroturfing.
- Name: do NOT use "StratoLaunch" — collides with Paul Allen's aerospace company in search. Pick a clean name with an available domain.

**Affiliates (answer to "influencers won't accept"):** 30–50% commission via LemonSqueezy/Rewardful. Recruit directory-list curators, boilerplate sellers, and past clients (20% recurring) — high-commission services get yes far more often than SaaS trials.

## Track 2 — JobPosted lifetime deal (cash + distribution)

- **Positioning:** AIHawk (the ~30k-star open-source auto-apply agent) was archived May 2026 — its users are orphaned. JobPosted is the hosted, no-setup successor. Price anchors: LazyApply sells $69 LTDs against $99–999/yr plans.
- **Channels:** DealMirror + DealFuel (fastest approval), AppSumo self-serve marketplace (~1 week to live). Marketplaces take 30–70% — treat as paid distribution that also pays cash.
- **Target:** 15–30 sales × $49–69 ≈ **$700–2,000 gross**.
- **Faceless content loop:** 1/day screen-recorded short — extension filling a full Workday app in ~40s, captioned, TikTok/Shorts/Reels. Job-search content is a proven faceless niche. Drives installs independent of the LTD.

## Track 3 — White-label to staffing agencies (seed now, pays in August)

Recruiters fill Workday/Greenhouse portals all day. "Autofill for staffing agencies" at $250–500/mo; two pilots = the whole goal from one deal type. Outbound to agency ops managers on LinkedIn/email. Slow cycle — start conversations now, don't count on July close.

## Calendar & checkpoints

- **Days 1–3:** build scraper + audit gen + one-pager; submit LTD listings; curate directory list; dogfood JobPosted as case study.
- **Days 4–14:** 15–20 audited outreach/day; deliver first clients manually (automate after sale #3); 1 short/day.
- **Day 14 gate:** <2 service clients → raise price and pivot targeting to small dev agencies (they buy retainers). LTD flat → Reddit value posts in job-hunt subs.
- **Days 15–27:** scale what converted. Mix target: $1,200–1,500 service + $500–800 LTD + agency pilots in flight.

## Status

**PARKED** — game design (SUPER_OVER_GAME_DESIGN.md) is the active workstream. Say **"engine"** to start builds in this order: scraper → audit generator → outreach kit → one-pager → LTD assets.

**Distribution layer ready (2026-07-04):** [ENGINE_OUTREACH.md](ENGINE_OUTREACH.md) — the faceless affiliate/backlink machine: Creem native affiliate program setup, named target lists (listicle authors, newsletters, careertok creators, ghost-jobs journalists), word-for-word templates, LTD marketplace steps, 30-day calendar.
