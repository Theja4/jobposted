# The Speedrun Engine
## A faceless, ~$0 growth machine to reach 5,000–10,000 users in 30 days

**The one-line thesis:** In the worst white-collar job market in a decade, job-search rage is the most reliably viral content category on the internet — and JobPosted's product demo (a Workday form filling itself in 25 seconds, ending with a human "Confirm") is the single best answer to that rage. You don't need a face, an ad budget, or an audience. You need to industrialize the demo as short-form content, catch the rage traffic, and route it through a 3-minute magic-moment funnel.

**The machine has three gears — RAGE → RELIEF → RECEIPT:**

1. **RAGE (reach):** faceless short-form content that taps job-search despair (ghost jobs, 400 applications, "entry-level, 5 years experience"). This is where the views live.
2. **RELIEF (conversion):** the speedrun demo — screen recordings of applications filling themselves, ending with the review-and-confirm click. This is where installs happen.
3. **RECEIPT (loop):** in-product shareable stat cards + referral credits that turn every user into a content node. This is what compounds.

Everything below is one strategy. The Reddit layer, the data study, and Product Hunt are not separate ideas — they are distribution valves for the same machine.

---

## 0. The math (work backwards from 7,500 users)

| Source | Mechanism | Expected users (base case) |
|---|---|---|
| Short-form engine (TikTok + Reels + Shorts) | ~90 videos cross-posted → 2–4M cumulative views at volume, ~0.8% profile/link CTR, ~25% landing→install | 4,000–6,000 |
| Reddit layer | 8 "I built this" / data posts + daily value comments | 1,000–2,500 |
| Product Hunt (week 4) | One launch, assets recycled from content library | 500–1,500 |
| Receipt cards + referrals | 10–15% compounding uplift on everything above | 600–1,200 |
| **Total** | | **~6,000–11,000** |

Bear case (no video breaks 100K views): ~2,500–3,500 users. Bull case (one video does 1M+, which at 90 attempts in this niche is genuinely possible): 15K+. The kill/double-down rules in §9 exist to drag the bear case upward.

The honest odds: this is a fat-tailed bet with a floor, not a lottery ticket. Volume + format iteration is what moves you along the tail.

---

## 1. Why this strategy — and what we are deliberately NOT doing

| Option | Verdict | Why |
|---|---|---|
| SEO / programmatic pages | ❌ as primary (✅ seeded via §6) | 3–6 months to rank. Wrong tool for a 30-day window. The ghost-jobs study plants the SEO seed for free. |
| Paid ads | ❌ | Job-tool installs run $2–8 CAC on TikTok/Meta. 5K users ≈ $15–40K. Violates the budget constraint. |
| LinkedIn personal brand / founder-led content | ❌ | Requires face and identity. Ruled out by you. |
| Cold outreach / B2B motion | ❌ | Wrong motion for a consumer tool. |
| Influencer seeding | ⚠️ optional booster only | $200–400 to 3–5 micro careertok creators in week 3 IF the engine is converting. Never before. |
| **Faceless short-form demo engine + community + data spikes** | ✅ | The demo is inherently viral-format content (oddly-satisfying + speedrun + relief). Faceless is native to the format. $0. Compounds via the job-data "daily drop" format and the receipt loop. |

**The unfair advantages this strategy is built on (yours, specifically):**
1. The product's magic moment is *visually self-explanatory in under 30 seconds* — most SaaS would kill for this.
2. Your ingest pipeline pulls 51 boards daily → you can produce "fresh jobs" content and original data journalism *from your own database*.
3. "Copilot, not autopilot" — Reddit and careertok actively hate spray-apply tools (LazyApply et al. get roasted in every thread). You are positioned as the anti-spray tool. Lean into it everywhere.
4. Rezoomed gives you a second value hook (tailored resume per job) inside the same funnel.

---

## 2. Week 0 — Pre-flight (Days 1–4). Do NOT skip. Traffic into a leaky funnel is wasted.

### 2.1 Fix the two known product leaks first
- **Greenhouse employment/education gap:** the per-field LLM path can hit the 40s frame timeout → false "no fields found" + zombie fill. A viral spike straight into this bug = 1-star Chrome reviews, and Chrome store rating is a ranking factor you cannot repair quickly. Fix or fence it (e.g., cap scope to fields that fill reliably and message "X fields filled, Y need you" honestly — honest partial fill beats broken full fill, and matches brand voice).
- **Workday account gate:** ensure a first-run user who hits a Workday "create account" wall gets a clear guided step, not a dead end.

### 2.2 Compress time-to-magic-moment to under 3 minutes
The funnel every video points to: **click → landing → Add to Chrome → open a real job → watch it fill → user hits Confirm.**
- Landing page: hero must be an **autoplaying screen-recording of the fill** (muted, looped, 15s). One primary CTA: "Add to Chrome — free." Kill every other above-the-fold choice.
- Do not gate the first fill behind account creation if avoidable. Let the first 3–5 fills be free-with-no-signup (or signup *after* the first fill, when trust exists). Every field you ask for pre-magic-moment costs you ~10–20% of installs.
- Add a `/tiktok` (and `/reddit`, `/ph`) landing path or UTM-tagged links so every channel is measurable. Use one link shortener per platform bio.

### 2.3 Chrome Web Store listing = your app store SEO (free, most founders ignore it)
- Title/keywords: "AI job application autofill — Workday, Greenhouse" (people search the portal names, not "job copilot").
- First screenshot = the speedrun with a timer overlay. Add a 30s listing video.
- Seed 10–15 honest reviews from real early users you know (never buy reviews).

### 2.4 Instrumentation (2 hours, non-negotiable)
- PostHog or GA4: landing views, install clicks, extension installs, first-fill completed, signup, D1/D7 return.
- One spreadsheet dashboard: per-video views / link clicks / installs by UTM. You will run kill/double-down decisions off this (§9).

### 2.5 Accounts (all faceless, all branded)
- TikTok: `@jobposted` (or `@jobposted.app`)
- Instagram Reels + YouTube Shorts: same handle, same content, cross-posted.
- X/Twitter: for receipt-card reposts and data-study distribution.
- Reddit: your real personal account, aged if possible — you will post as "the builder," disclosed. **No sockpuppets, ever** — it's against the rules of every sub, and getting caught is a brand-ending event on Reddit.

---

## 3. The Content Engine (Days 3–30) — 3 formats, industrialized

Cadence: **3 posts/day on TikTok, cross-posted to Reels + Shorts** (≈90 unique videos over the month, ≈270 platform-postings). Batch-produce twice a week (Sunday + Wednesday, ~3h each). All faceless: screen recordings, text-on-screen, AI voiceover (you already have AI voice tooling available; ElevenLabs free tier also works).

### Format A — "The Speedrun" (conversion engine) — 1/day
Screen recording of a real application filling itself. The anatomy that makes it work:
- **0–2s hook (text on screen):** "This job application took me 28 seconds" / "POV: your 47th application today takes 30 seconds"
- **2–20s:** the fill, at 1.5–2x speed, with a **running timer overlay** and soft mechanical-keyboard ASMR sounds (oddly-satisfying trigger).
- **20–25s:** the money shot — *the human clicks Review, then Confirm.* Caption: "It fills. YOU submit. Never behind your back." (This is your brand AND your differentiation vs spray tools in one beat.)
- **25–30s CTA:** "Free Chrome extension — JobPosted" (pinned comment carries the link; avoid links in captions on a young TikTok account).
- Variations: different portals (Workday speedrun, Greenhouse speedrun), different jobs ("filled a $145K PM application in 31 seconds"), races ("me vs. the extension filling the same Workday form" — split screen).

### Format B — "Rage bait / validation" (reach engine) — 1/day
Text-on-screen memes over simple B-roll (stock screen recordings, quiet desk shots — no face). This is where the algorithm reach comes from; job-search despair content has a monstrous engagement rate because commenting *is* the coping mechanism.
- "Entry level. 5 years experience required. $18/hr. On-site. In a city with no housing."
- "Rejected 8 minutes after applying. The role is still posted 6 months later."
- "Things recruiters say vs. what they mean" series.
- "The job you spent 40 minutes applying to was a ghost job. Here's how to tell →" (bridges into §6's data).
- CTA is soft or absent on most of these — their job is followers and algorithm juice, not clicks. Every 3rd one ends "I got tired of this so I built something — pinned."

### Format C — "The Daily Drop" (retention/compounding engine) — 1/day
**This is your moat format — it runs on your own ingest data, and competitors can't copy it without building your pipeline.** Query your DB every morning for fresh, high-signal roles and template a listicle video:
- "7 remote jobs paying $100K+ posted in the LAST 24 HOURS (Day 14)" — role, company, salary, one-liner. All links live on a JobPosted collection page (that's the click driver).
- Niched variants by weekday: remote-only Monday, no-degree-required Tuesday, entry-level-that's-actually-entry-level Wednesday (ties to Format B rage), visa-sponsoring Thursday, $150K+ Friday.
- The "Day N" serialization + daily freshness turns viewers into **followers who return** — this is the difference between a viral spike and an audience. Job-drop accounts with zero face routinely sit at 100K–500K followers; almost none of them own the underlying job data. You do.
- Semi-automate: a small script that pulls the day's top roles (filters: posted <24h via `ingested_at`, salary present, remote flag) into a text template = 15 min/video.

### Production SOP (batch day)
1. Write 10 hooks from the hook library (Appendix A), pick trends from TikTok Creative Center (free).
2. Record 4–5 speedruns in one session (OBS, 60fps, clean profile, realistic-but-fake personal data).
3. CapCut desktop with 3 saved templates (one per format): auto-captions, timer overlay preset, sound presets.
4. AI voiceover for Format C.
5. Schedule: 9–11am, 1–3pm, 7–9pm ET posting slots. Reply to every comment in the first hour (comment velocity is an algorithm input — and comments like "does it work on Workday?" are free objection-handling).

---

## 4. The Community Layer — Reddit (+ Discords) — 30 min/day

Reddit converts job-tool traffic better than any platform because intent is maximal. It also bans self-promo faster than any platform. The rules of engagement:

**Identity:** one real account, always disclose "I built this." Read each sub's rules before posting. Message mods first where required. Never DM-spam, never sockpuppet, never fake a "just found this cool tool" post.

### 4.1 Launch-style posts (~2/week, rotate subs)
| Sub | Angle |
|---|---|
| r/SideProject, r/indiehackers | "I built a Chrome extension that fills job applications but refuses to auto-submit — here's why" (the copilot-not-autopilot angle is *catnip* here) |
| r/InternetIsBeautiful | The free tool angle (check current promo rules) |
| r/chrome_extensions, r/ChromeExtensions | Straight demo + GIF |
| r/webdev, r/nextjs (build-story angle) | "How I parse Workday's automation-ids to autofill applications" — technical war story, tool mentioned once |
| r/jobs, r/jobsearchhacks, r/GetEmployed | ONLY value-first posts (see 4.3); many ban tool promo — comments are the play here |
| r/recruitinghell (~1M members, pure rage) | Never promote. Post Format-B-style content natively; let your profile do the selling. This sub is where your data study (§6) will detonate. |

**Post anatomy that works:** honest builder story → the pain that caused it ("I applied to 300 jobs in 4 months") → 20–40s GIF of the speedrun → what it deliberately does NOT do (auto-submit) → free tier → ask for feedback, answer every comment for 6 hours. Posts framed as "roast my tool" outperform "check out my tool" ~3:1.

### 4.2 The data posts (week 3, see §6) — r/dataisbeautiful, r/jobs, Hacker News.

### 4.3 Daily comment SOP (15–20 min)
Sort r/jobs + r/jobsearchhacks by New. Answer application-grind questions with genuinely complete answers (portal quirks you know cold — you've reverse-engineered Greenhouse and Workday's DOM; almost nobody commenting has that depth). Mention JobPosted only when directly on-topic and allowed, max 1-in-4 comments. Your comment history becomes the trust layer for your launch posts.

### 4.4 Discord/Slack career servers
Join 5–10 (bootcamp alumni, "tech jobs" servers, university career channels, H1B/international-student communities — the highest-volume appliers on earth). Be useful for a week before ever linking. Then share in tools/resources channels only.

---

## 5. Spike Event #1 — The Ghost Jobs Data Study (Week 3)

**You are sitting on the asset:** 51 boards ingested daily, with `ingested_at` / `last_seen_at` timestamps. Ghost jobs are a national rage topic with recurring press cycles, and almost every article cites tiny surveys. You can publish *actual longitudinal posting data*.

**The study (2–3 days of queries + writing):**
- % of postings still live after 30/60/90 days ("zombie postings")
- Median posting lifespan by industry / seniority / board
- Repost detection: same title+company disappearing and reappearing (classic ghost-job signature)
- Salary transparency rate by state (compliance-law angle = second headline)
- Headline stat format: **"We tracked 120,000 job postings. X% showed ghost-job signatures."**

**Publish & distribute:**
1. Long-form post on jobposted.com (this is also your SEO seed — "ghost jobs statistics 2026" has durable search volume and every future journalist Googles it).
2. One killer chart → r/dataisbeautiful (OC rules: your data, your viz — you qualify, which is rare and powerful).
3. Narrative version → r/jobs, r/recruitinghell ("We analyzed 120K postings. Here's proof you're not crazy."). This is validation content for 1M enraged people — it will travel.
4. Hacker News: submit the study (not the product).
5. Email 10–15 journalists who've written about ghost jobs (search the term on Google News; company byline — **no face or personal identity needed, "the JobPosted research team" is standard practice**). Offer the dataset/methodology. One pickup = a backlink + credibility loop forever.
6. Slice into 5+ Format B videos ("we have the DATA now" series).

---

## 6. Spike Event #2 — Product Hunt (Week 4, a Tuesday)

By week 4 you have: a warm TikTok/Reddit audience to rally, a polished demo library, review-proofed extension, and a data study for credibility.
- Assets: 30s speedrun video, 5 gallery images (speedrun · daily-drop feed · review-confirm screen · Rezoomed tailoring handoff · ghost-jobs chart).
- Tagline options: "The job application copilot that never applies behind your back" / "Fill any job application in 30 seconds. You hit submit."
- First-comment: builder story (faceless is normal on PH), the copilot principle, free tier.
- Launch 12:01am PT, rally your Reddit/TikTok followers ("we're live on PH today"), reply to every comment all day.
- Realistic yield: 500–1,500 signups + a durable badge/backlink. Do not over-invest; it's a valve, not the machine.

---

## 7. The Loop — Receipts & Referrals (build in Week 1, ~2 dev days)

Job seekers *already* screenshot their application-tracker spreadsheets to Reddit and X constantly ("450 applications, 3 interviews"). Give them a better artifact:

### 7.1 Application Receipts
After each confirmed application, render a clean shareable card:
> **Application #47** · Senior PM @ Stripe · 31 fields filled · 4 min saved · [JobPosted]
One-tap copy/download. Subtle branding, dark/light variants (people share what looks good).

### 7.2 Weekly Wrapped
Every Sunday: "Your week: 23 applications · 1.9 hours saved · 3 portals conquered." Spotify-Wrapped mechanics work because they're identity content — for job seekers, *proof of effort* is identity content (see every "my 6-month job search in numbers" megathread).

### 7.3 Referral credits
"Give 20 AI fills, get 20" per friend who installs. Surface it exactly twice: right after the first successful fill (peak delight) and on the Wrapped card. K-factor of even 0.15 adds ~15% compounding to every channel above.

---

## 8. Operating cadence — you are the growth team (~2.5 hrs/day)

| Time | Task |
|---|---|
| 30 min AM | Post video #1, pull Daily Drop data, check dashboard vs. yesterday |
| 20 min midday | Post video #2, reply to all comments |
| 30 min PM | Post video #3, Reddit comment SOP (§4.3) |
| 2× week (3h) | Batch production; 1 launch-style Reddit post |
| Sunday (1h) | Metrics review → kill/double-down (§9); plan the week's hooks |

---

## 9. Kill / double-down rules (decide on data, not vibes)

- **Per-format weekly review:** views, profile-visit rate, link CTR, installs per 10 posts. Kill the worst-performing hook family weekly; clone the best into 3 variants.
- **Day 10 checkpoint:** if no video >25K views → shift mix to 2× Format B (reach) + 1× A, and trend-jack harder (layoff news cycles, big-tech hiring-freeze headlines — react within 24h; rage content rides news).
- **Day 14 checkpoint:** if installs <800 → spend the optional $200–400 on 3–5 micro careertok creators (10–50K followers; they charge $50–150 and their audiences are 100% job seekers). Give them the speedrun format — it's proven by then.
- **If a video breaks 250K views:** post 2 direct variants within 48h (same hook, new job/portal), pin the link comment, and push the Daily Drop hard to convert the follower influx into daily returners.
- **Never:** buy followers, buy reviews, astroturf Reddit, or auto-DM. Beyond ethics, each is a detectable, account-killing behavior — and the account IS the asset.

### Dashboard (daily, one row per day)
Installs · signups · first-fills · D1 return · per-channel clicks (UTM) · cumulative users vs. the 7,500 pace-line (250/day).

---

## 10. The 30-day calendar

| Days | Focus |
|---|---|
| 1–4 | Pre-flight: bug fixes (§2.1), funnel compression, tracking, Chrome listing, accounts created, first batch produced |
| 5–7 | Engine on: 3 posts/day begins · first r/SideProject post · receipt cards ship |
| 8–14 | Full cadence · 2 more Reddit posts · referral live · Day-10 checkpoint · start data-study queries |
| 15–21 | Cadence continues · ghost-jobs study published + r/dataisbeautiful + HN + journalist emails · Day-14 checkpoint (micro-influencer decision) |
| 22–28 | Product Hunt launch (Tuesday) · rally audience · recycle PH momentum into content |
| 29–30 | Wrapped cards push · month retro: cohort retention, channel CAC=0 accounting, decide next-month doubling |

---

## 11. Budget

| Item | Cost |
|---|---|
| Core machine (content, Reddit, data study, PH) | $0 |
| CapCut Pro (optional) | ~$10 |
| Link shortener / analytics tier (optional) | ~$0–15 |
| Micro-influencer booster (only if Day-14 gate triggers) | $200–400 |
| **Total worst case** | **< $450** |

---

## 12. Risks & honest failure modes

| Risk | Mitigation |
|---|---|
| No video hits (bear case) | Volume (90 attempts) + weekly format culling + trend-jacking + influencer booster. Bear case still lands ~2.5–3.5K users — a real base to compound next month. |
| Viral spike hits a broken flow | §2.1 fixes FIRST. A 1-star Chrome review wave is the only unrecoverable outcome in this plan. |
| Reddit post removed / account flagged | Rules-first posting, mod pre-clearance, disclosure, 1-in-4 mention ratio. Diversify across 8+ subs. |
| TikTok suppresses link-in-bio behavior on new accounts | Warm the account 3–4 days with no links; links in pinned comments; CTA verbal/text only. |
| Chrome Web Store review delay blocks an update mid-spike | Ship the §2.1 fixes in week 0, freeze extension releases during spike windows; keep the web app as fallback signup. |
| Data study methodology attacked in comments | Publish methodology + caveats openly; "signatures of ghost jobs," not accusations against named companies. |

---

## Appendix A — Hook library (write 3 variants of each on batch days)

**Speedrun (A):** "This Workday application took 28 seconds" · "POV: application #47 today, but it's 2026" · "Me vs. my extension filling the same form" · "$145K job. 31 fields. 34 seconds." · "It fills everything. Then it WAITS for you."

**Rage (B):** "Rejected in 8 minutes. Posting's been up 6 months." · "'Entry level.' 5 years experience. $18/hr." · "The 6 signs the job you're applying to doesn't exist" · "Recruiter said 'we'll keep your resume on file.' The file:" · "Day 137 of applying. The market is fine, apparently."

**Daily Drop (C):** "7 remote jobs $100K+ posted in the last 24 HOURS — Day 12" · "5 companies actually hiring juniors this week" · "Visa-sponsoring roles posted TODAY — Day 8"

## Appendix B — Reddit "I built this" post skeleton
Title: *"I applied to 300 jobs in 4 months. Then I built a Chrome extension that fills applications in 30 seconds — but refuses to auto-submit. Roast it."*
Body: the pain story (3 sentences) → 30s GIF → "what it deliberately doesn't do" (no auto-submit, no spray — and why) → free tier → "what would make you trust a tool like this?" → answer everything for 6 hours.

## Appendix C — Journalist pitch (faceless)
Subject: *Data: we tracked 120,000 job postings — X% show ghost-job signatures*
2 paragraphs: the finding, the method (51 boards, daily snapshots, N days), offer the dataset + charts, sign as "the JobPosted research team," link the study. No identity required; researchers-behind-a-company-byline is standard.

## Appendix D — Micro-influencer DM (if Day-14 gate triggers)
"Hey — we make a Chrome extension that fills job applications in ~30s (you hit submit, it never auto-applies). Your audience is exactly who it's for. Flat $X for one video in your style — here's a format that's been working: [top speedrun link]. No script approval needed, say what you actually think."
