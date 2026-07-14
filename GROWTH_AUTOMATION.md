# Speedrun Engine — Automation Architecture
## Companion to GROWTH_PLAYBOOK.md · Target ops load: ≤45 min/day human time · Target tooling spend: $0–40/mo

**Principle:** automate *production* fully, automate *distribution* to the review line, and keep a human on the last mile (posting, Reddit, replies). Full-auto posting is where accounts get banned and where brands get caught astroturfing — the 30 min/day you keep is what makes the other 95% automation safe.

**The revenue frame:** users are the input; the machine below wires traffic → activation (first fill) → metered free tier → upgrade moments, all automated. Realistic outcome at 5–10K users with a metered freemium: 2–5% paid conversion on *activated* users → **$3–6K MRR by day 45–60**, compounding with retention + SEO. The single biggest revenue lever is activation rate, not traffic — which is why half the automation below feeds the product loop, not social.

---

## 1. The stack (build vs. buy)

| Layer | Tool | Cost | Why |
|---|---|---|---|
| Video rendering (Formats A/B/C) | **Remotion** (React → MP4, runs on your Railway worker) | $0 (free ≤3-person company) | Code-templated videos; you're a React shop; infinite variants at zero marginal cost |
| Raw speedrun capture | **Playwright** + your extension loaded, `recordVideo` 1080×1920 | $0 | Scripted: feed job URLs → get raw fill recordings, no human recording sessions |
| Voiceover | ElevenLabs free tier, or the AI audio tools already connected to this session (Higgsfield `generate_audio` / `create_voice`) | $0–5 | Format C narration |
| Static/carousel content | **satori / @vercel/og + sharp** (you're on Vercel already) | $0 | TikTok photo-mode carousels + IG memes = the most automatable format (no video render at all) |
| Post scheduling | **Buffer free** (3 channels, 10 queued/channel) → upgrade to **Postiz** (~$29/mo or self-host free) when volume hurts | $0 → $29 | Official-API posting only; never unofficial auto-posters (ban vector) |
| Reddit/HN monitoring | **F5Bot** (free keyword alerts) + Reddit RSS + a digest script | $0 | Finds threads worth a human comment |
| Analytics | **PostHog free tier** + a daily KPI digest cron | $0 | Installs, activation, per-UTM conversion, pace-line vs 250 users/day |
| Lifecycle email | **Resend** free tier (100/day) + cron | $0 | D0/D2/credit-exhaustion/Wrapped emails |
| Payments | Stripe (already have pricing page) | 2.9% | Weekly + monthly plans, pause-when-hired |
| Orchestration | **Vercel crons / Railway worker** (data + render pipelines) + **Claude Code scheduled tasks** (drafting/research jobs) | $0 marginal | Use your own crons for production pipelines; use Claude scheduled tasks for LLM-judgment work (hook writing, Reddit digests, trend scans) |
| Outreach & 24/7 judgment work | **Hermes Agent** (open-source, self-hosted — Nous Research) on a $5 VPS, pointed at your existing OpenRouter/gateway key | $5–15/mo | Email + Telegram gateways, built-in cron, persistent memory + self-written skills. Runs the outreach cell (§2.9): prospecting, personalized drafts, follow-ups, reply triage — with your phone as the approval line |

**Total: $0–15/mo to start; ≤$55/mo at full throttle.** Everything else is code in this repo, which I can write.

---

## 2. Automation map, gear by gear

### 2.1 Format C — Daily Drop: **95% automated** (your moat, so it gets the most automation)
Pipeline (daily cron, ~7am ET):
1. **Query** your own DB: roles with `ingested_at` < 24h, salary present, remote/visa/entry-level flags → top 7 by salary/brand recognition, themed by weekday.
2. **LLM pass** (your existing OpenRouter/gateway): titles → 30s script + caption + hashtags + collection-page blurb.
3. **Publish the collection page** (`/drops/2026-07-04-remote-100k`) — this is the link target AND a programmatic SEO page. Auto-created via your existing Next.js stack.
4. **Render** the video with a Remotion template (list layout, count-up salary numbers, VO track) on the worker.
5. **Deliver to the review line:** file + caption dropped into a `ready-to-post/` folder + Telegram/email notification to your phone. You approve & schedule in Buffer — **~5 min/day**.

### 2.2 Format A — Speedrun: **80% automated**
1. Maintain a list of live job URLs (from your own ingest — filter for Greenhouse/Workday postings on demo-safe companies) + a fake-but-realistic test profile.
2. **Playwright batch job:** loads Chrome with your extension → opens each URL → triggers autofill → records 1080×1920 video of the fill → stops at the review screen. Ten raw recordings per run, unattended.
3. **Remotion wrapper:** timer overlay, hook text from the hook library (LLM-generated variants), caption track, keyboard-ASMR audio bed, end-card ("It fills. You submit.").
4. Human picks the best 5 per batch → review line. **~15 min per batch, twice a week.**
5. Bonus: this doubles as an **automated regression test** for the extension — if the fill breaks on a portal, you see it in the recording before your users do.

### 2.3 Format B — Rage memes: **90% automated**
- Nightly LLM job: 10 hook variants from the prompt bank + today's layoff/hiring headlines (RSS: TechCrunch layoffs tag, Layoffs.fyi) → renders text-on-screen images via satori (carousel) + optional Remotion b-roll video variant → review line.
- Post as TikTok photo-mode + IG carousel — photo posts get comparable reach to video in this niche and cost nothing to render.

### 2.4 Reddit — **automate discovery & drafting; NEVER auto-post**
- F5Bot alerts on: "job application autofill", "workday autofill", "lazyapply", "simplify jobs", "ghost jobs", "applied to 300 jobs".
- Daily digest cron (or a Claude scheduled task): scans new posts in r/jobs, r/jobsearchhacks, r/recruiterhell via RSS → filters for threads where you have genuine expertise → drafts a suggested comment for each → one email/Telegram digest.
- **You read, edit, and post by hand — 15 min/day.** Auto-posting to Reddit is both detectable (ban) and astroturfing (brand-ending). This line is not moved.

### 2.5 Receipts & Wrapped (the product loop) — **100% automated by definition**
- `@vercel/og` route renders receipt cards (`/api/receipt/[applicationId]`) — dark/light, one-tap share, subtle branding.
- Sunday cron: Wrapped stats per active user → in-app card + Resend email ("23 applications · 1.9 hrs saved") with share + upgrade CTAs.
- Referral credits: +20 fills per installed friend, surfaced post-first-fill and on Wrapped.

### 2.6 Ghost Jobs study → **auto-updating Ghost Job Index (press magnet on a cron)**
- One-time: the analysis queries (zombie postings >60d, repost signatures, salary transparency by state) + the write-up.
- Then a monthly cron regenerates `/ghost-job-index` with fresh numbers — journalists get a living, citable stat page; you get evergreen backlinks and a monthly excuse to re-pitch. Nobody else in this niche has the underlying data on a pipeline.

### 2.7 Programmatic SEO — **100% automated, compounds after day 30**
Your ingest already powers it: auto-generated ISR pages per high-intent slice ("remote product manager jobs $150k+", "companies sponsoring H-1B hiring now", per-city/per-stack pages), fed by daily data, interlinked from Daily Drop collection pages. Zero marginal cost; this is next month's traffic floor.

### 2.8 KPI digest — **100% automated**
Daily 8am cron → PostHog API → one Telegram/email message: installs, activations (first fill), D1 return, per-UTM conversion, paid conversions, MRR, pace vs. 250-users/day line, best/worst video of yesterday. Your kill/double-down decisions (§9 of playbook) take 5 minutes because the data is pre-chewed.

### 2.9 Influencer & partner outreach — the Hermes Agent cell: **80% automated**

This is where **Hermes Agent** (Nous Research's open-source, self-hosted agent — persistent memory, self-written skills, built-in cron, email/Telegram/Discord gateways) earns its keep. Outreach is judgment work on a schedule — research, personalization, follow-up discipline — which is exactly the shape agent harnesses are good at, and exactly the shape deterministic cron scripts are bad at. It also upgrades the playbook's "optional day-14 influencer booster" into a **standing, near-free channel**, because 25 personalized outreaches a day costs pennies in tokens.

**Setup (half a day, once):**
1. Hermes on a $5–10/mo VPS (or any always-on box), pointed at your existing OpenRouter/gateway key — cheap model for routine steps.
2. Gateways: Telegram (your phone = the approval line) + a dedicated outreach mailbox on a **separate domain** (e.g. `hello@tryjobposted.com`) so cold sends can never hurt jobposted.com deliverability. Warm it up 1–2 weeks at low volume. SPF/DKIM/DMARC on day one.
3. A shared sheet/DB as CRM: prospect, niche, followers, email, status, thread log. Hermes reads/writes it; you can always see the whole pipeline.

**Who it prospects (bigger surface than just TikTokers):**
- Careertok/jobtok micro-creators, 10–100K followers (the day-14 booster list)
- **Job-search newsletter writers** (Substack/beehiiv — high trust, cheap sponsorships, love free tools)
- **Career coaches** (they recommend tools to clients for a living — natural affiliates)
- Discord/Slack career-server owners and university career-newsletter editors
- Week 3: the **journalist list** for the ghost-jobs study (§2.6) — Hermes builds the list of everyone who's written about ghost jobs and drafts the pitches from Appendix C

**Nightly cron workflow:**
find 15–25 new prospects → verify a real business email (bio/link-in-bio/about page; skip if none — no guessed addresses) → draft a personalized email that cites one specific piece of their actual content → batch lands on your Telegram → you approve/edit/reject each (~10 min) → Hermes sends approved ones, schedules day-3 and day-7 follow-ups, stops instantly on reply, and pings you to take over the conversation.

**Hard guardrails (non-negotiable):**
- **Volume:** ≤25–40/day from a warmed mailbox. This is 1:1 business inquiry, not mass cold email.
- **Truth:** the personalization line must reference a real, linked post — a hallucinated compliment ("loved your video about X" when there is no such video) is instantly detectable and brand-burning. Human-approve every send for the first ~50; loosen only after the error rate proves out.
- **Authority cap:** Hermes never negotiates money or promises terms — the moment a human replies, a human takes over. It can state the standing offer only (see below).
- **Hygiene:** honor every opt-out immediately, real sender identity, no deceptive subject lines.
- **Scope:** Hermes gets the outreach mailbox and the CRM sheet — never production DB write access, never your social accounts.

**The offer (performance-priced, so CAC stays near zero):** default to affiliate rather than flat fees — a unique promo code + rev-share (e.g. 30% of first 3 months, tracked via Stripe promo codes, paid manually each month = $0 tooling). Flat $50–150 only for proven speedrun-format creators. Expected reply rate on genuine micro-creator/newsletter inquiry: 10–20% — it's a welcome email, not spam.

**Division of labor with the rest of the stack, stated once:** deterministic production (renders, cards, SEO pages, KPI pulls) runs as code on Vercel/Railway crons; **scheduled judgment work** (prospecting, drafting, digests, trend scans) runs on Hermes; **taste and trust** (approvals, Reddit posting, negotiations) stays human at ~40 min/day.

---

## 3. Revenue wiring (the point of all this)

**Meter:** AI fills + AI answers are your natural credit unit (they cost you tokens; users understand them).
- **Free:** ~25 fills + 10 AI answers — enough to hit the magic moment 5+ times and form a habit, not enough for a real search week.
- **Paid:** ~$9/week "Sprint" (job seekers think in weeks, and urgency is transient) + ~$19/mo "Search" with **pause-when-hired** (kills churn guilt, earns Reddit goodwill). Optional day-1 **$49 early-bird lifetime** capped at first ~300 buyers to fund the month.
- **Rezoomed cross-sell:** tailored-resume credits as an add-on or bundled in paid — second SKU, same funnel.

**Automated upgrade moments (in priority order):**
1. Credit exhaustion modal — fires at peak proven value ("You've saved 3.2 hours. Keep going → $9/wk").
2. Wrapped email upgrade CTA (weekly, automated).
3. Receipt-card footer on shared cards (every share is a mini-ad with a price on it).
4. D2 lifecycle email: "Your first 5 fills saved you ~40 minutes" (Resend cron).

**Expectation-setting math:** 7,500 users → ~60% activate (first fill; this is THE number to optimize) → 3–5% of activated pay → 130–225 payers → **$2.5–5K MRR** exiting the month, before referral/SEO compounding. A "good chunk of revenue" in 30 days means this order of magnitude — anyone promising $50K month-one on $0 spend is lying to you. Month 2–3 is where SEO pages + retention + the loop bend the curve.

---

## 4. What stays human (deliberately)

| Task | Time | Why it can't be automated |
|---|---|---|
| Final approve + schedule of every post | 10 min/day | Account safety, taste, avoids robotic cadence fingerprints |
| Reddit comments/posts | 15 min/day | Ban risk + authenticity is the strategy |
| Replying to comments in the first hour | 15 min/day | Comment velocity is an algorithm input; replies are objection-handling |
| Weekly kill/double-down call | 15 min/wk | Judgment on pre-chewed data |

**Total human ops: ~40–45 min/day.** Everything else runs on crons.

---

## 5. Build order (all of it lives in this repo; I can build each)

| # | Build | Effort | Payoff |
|---|---|---|---|
| 1 | Receipt cards + referral credits (`@vercel/og` route + share UI + credit ledger) | ~1 day | Product loop live before traffic arrives |
| 2 | Daily Drop pipeline v1 (SQL + LLM captions + collection page + Telegram review line) — video render can start manual-in-CapCut while Remotion lands | ~1 day | Format C flowing from day 3 |
| 3 | KPI digest cron | ~0.5 day | Decision engine |
| 4 | Playwright speedrun recorder | 1–2 days | Format A at scale + free regression testing |
| 5 | Remotion templates (Drop list, Speedrun wrapper, Rage carousel) | 2–3 days | Full render automation |
| 6 | Lifecycle emails + credit-exhaustion paywall moment | ~1 day | Revenue wiring |
| 7 | Reddit digest agent (cron or Claude scheduled task) | ~0.5 day | Community layer assist |
| 8 | Ghost Job Index queries + auto-updating page | ~2 days | Week-3 spike + evergreen press asset |
| 9 | Programmatic SEO slices | ~2 days | Month-2 compounding |
| 10 | Hermes outreach cell (VPS install + email/Telegram gateways + prospecting skill + CRM sheet + guardrails prompt) | ~0.5–1 day | Standing influencer/newsletter/coach/journalist channel (§2.9) |

Suggested sequence for week 0–1: **1 → 2 → 3 → 4**, then 5–10 while the engine runs. Stand up the Hermes cell (10) any time after the funnel fixes — its first real batch should go out by day 7 so newsletter/coach replies land before the week-3 data study.

---

## 6. Explicit non-recommendations

- **Unofficial auto-posting tools / browser bots posting to TikTok/IG** — account termination vector; your accounts ARE the asset. Official-API schedulers (Buffer/Postiz) or human-tap only.
- **Auto-commenting bots on Reddit/anywhere** — astroturfing; one exposure thread ends the brand.
- **Buying followers/reviews/engagement** — poisons the algorithm data you need for kill/double-down decisions, besides the obvious.
- **$200+/mo "AI social growth" SaaS suites** — they resell the same LLM calls you already have server-side keys for; every one of them is replaceable by ≤1 day of code in this repo.
