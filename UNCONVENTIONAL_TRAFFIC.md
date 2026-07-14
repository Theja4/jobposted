# UNCONVENTIONAL_TRAFFIC — out-of-the-box traffic plays

*Saved 2026-07-05. Companion to ENGINE_OUTREACH.md and GROWTH_PLAYBOOK.md. Same constraints: faceless, no ads, ~$0. Ranked by (unfair advantage × effort). Tier A runs on the ingest data moat — competitors cannot copy these without building the pipeline.*

---

## Tier A — data-moat plays (the ingest pipeline IS the marketing department)

### A1. Ghost Job Detector — the flagship free tool
Paste a job URL → get a ghost-probability score (repost count, posting age across boards, salary transparency, description recycling — all queryable from ingest history). Why it wins:
- **It's the shareable artifact of the exact rage** the GROWTH_PLAYBOOK targets ("this job is 87% likely a ghost" screenshots are self-propagating on Reddit/TikTok).
- Every check can render an indexable result page → programmatic SEO on real long-tail queries ("is the {company} {role} posting real").
- It feeds and promotes the week-3 ghost-jobs study; journalists get a tool to link, not just a PDF.
- Funnel: "This job looks real → apply in 30 seconds with JobPosted."
Effort: 2–3 days (scoring heuristic + one page + share card). First step: define the 5 ghost signals the ingest DB can already answer.

### A2. Auto-updated GitHub job-list repos
SimplifyJobs' "New-Grad-Positions" repo proved this: auto-refreshed job lists earn tens of thousands of stars and rank in Google. Ship `jobposted/new-grad-2027` and/or `fresh-remote-jobs` (updated daily by a cron from ingest, README badges, links to collection pages on jobposted.app).
- GitHub is a search engine for exactly your users; stars compound; every fork/star is distribution.
- Legitimizes the AIHawk-successor story with the open-source crowd.
Effort: 1 day (formatter + Actions cron). First step: pick 2 niches (new-grad, remote $100K+) and generate the first README from ingest.

### A3. Hiring-surge radar (newsjacking machine)
The pipeline sees which companies suddenly post 30/50/200 roles before anyone reports it. Publish surges as: an X/Bluesky/Threads account ("🚨 {Company} just opened 214 roles, 61% remote"), a weekly "Hiring Surge Report" post, and same-day TikTok Daily-Drop variants.
- Journalists and job seekers both follow whoever spots surges first; it's the inverse of layoff news and nobody owns it.
- Fully automatable (label the account as automated, respect platform rate limits).
First step: one SQL query — companies whose 7-day posting count is >5× their trailing average.

### A4. Layoff-response kits (same-day timing plays)
When a layoff hits the news (you already watch layoffs.fyi): publish "{Company} layoff? The 48-hour plan" — severance/COBRA/unemployment checklist + "companies currently hiring {Company}-type skills" (from ingest) + tracker template. Post the link in the layoff megathreads (disclosed, helpful-first) and hand it to the Laid Off newsletter.
- Highest-intent moment in the entire funnel: the day someone is laid off.
- The generic version ("Layoff Survival OS" Notion/Sheet) doubles as a Gumroad free download + community seed.
First step: build the generic kit once; per-company versions are 30-minute find-and-replace + one ingest query.

---

## Tier B — product-surface plays (new shelves for the same product)

### B1. ATS-troubleshooting SEO (bottom-funnel, zero competition)
People mid-application search "Workday application stuck," "how to upload resume to Workday," "Greenhouse resume parsing wrong," "Workday create account for every job." Publish short fix guides + 60s screen-recorded tutorial Shorts (rank in Google video carousels). You literally have Workday DOM expertise in the repo.
- This traffic is people *inside an application right now* — the perfect install moment.
First step: 10 pages, one per known ATS pain (the extension's adapter bugs list is the keyword list).

### B2. Edge Add-ons + Firefox AMO ports
MV3 extension ports are typically ~a day of work. Edge store competition is thin, discovery is decent, and the Edge audience (corporate machines) is exactly Workday users. Two more store listings = two more permanent search surfaces + backlinks.

### B3. GPT Store + MCP server (ride the AI-agent wave)
- Free "Resume Tailor" / "Ghost Job Checker" GPTs in the GPT Store (real discovery traffic, zero cost, faceless) that soft-funnel to Rezoomed/JobPosted.
- Publish a small **JobPosted MCP server** ("let Claude/ChatGPT search fresh jobs from 51 boards") — that's a Show HN and dev.to post that rides agent hype, and MCP directories are new, empty shelves.
First step: GPT wrappers of existing prompts (hours, not days).

### B4. Open-source one component
Release the ATS form-schema mapper or a `ats-url-parser` lib under the JobPosted org. Dev traffic, GitHub stars, credibility for the AIHawk-orphan pitch ("we open-source parts, host the rest"). Pick something useful but not the moat (NOT the ingest pipeline, NOT the apply engine).

### B5. Embeddable "fresh jobs" widget
Free JS widget: any career-coach site or newsletter can embed a live feed of fresh roles (filtered to their niche), "Powered by JobPosted." Partners get free daily content; you get backlinks + brand impressions on every career-coach site that says yes. Natural add-on offer in every Tier-1/Tier-3 pitch already going out.

---

## Tier C — distribution hacks (cheap, weird, additive)

### C1. Coupon-site seeding
Create 2–3 official promo codes and an on-site /promo page. RetailMeNot/Honey/coupon scrapers list them automatically; "jobposted promo code" searches then land on controlled pages. Captures buyers at the decision moment; ~an hour of work.

### C2. Pinterest as a search engine
Resume templates, ATS checklists, "questions to ask in interviews" infographics — pinned to boards, linking to Rezoomed free tools. Pinterest is evergreen, faceless-native, and career/resume content is a proven vertical there. 10 pins/week from existing assets via Canva.

### C3. Subreddit wikis + community resource lists (permanent placements)
Job-search subs and career Slacks/Discords keep pinned resource wikis almost nobody pitches. One disclosed mod-mail each: "free tool, free Pro for your mods, add if useful." Includes **Never Search Alone** (phyl.org job-search councils), bootcamp alumni Slacks, university subreddit wikis. A wiki line is a permanent, algorithm-proof placement.

### C4. Canva Creators (extends the Etsy/Notion play)
Canva template creators publish resume templates with element links — same bundle/affiliate pitch as Etsy sellers, different marketplace, same buyer at the same moment.

### C5. The speedrun stunt (PR artifact)
A public "Job Application Speedrun Leaderboard" page — world-record Workday application (with the human-confirm click), category rules, submission form. It's a meme with a URL: HN-able, reddit-able, TikTok-able, and every submission is user-generated demo content. Costs one afternoon.

---

## Honorable mentions
- **Voice-only podcast guesting** — "the anonymous founder of the anti-spray-apply tool" is a *better* story than a named founder; voice ≠ face, but it's Theja's call on identity comfort.
- **Spanish-language gap** — US Hispanic job-search content is underserved; @latinas_uprising / @latina_engineer partnerships + 5 translated pages test it cheaply.
- **Fiverr storefront** for the engine.md launch service — marketplace search traffic sells the service with zero outreach (Fiverr KYC is private; display name can be the brand).
- **Free Udemy/Skillshare mini-course** ("Land interviews with AI tools," faceless screencast) — course marketplaces have organic enrollment; funnel in lesson resources.

## Sequencing suggestion
Week 1: A2 (1 day) + C1 (1 hr) + B2 (1 day) while outreach sends run. Week 2: A1 (the flagship). Week 3: A3 bot + A4 kit (feeds the data-study PR week). Week 4: B3/B5 if earlier layers are converting; C5 stunt as the Product Hunt sidekick.

Guardrails unchanged: no fake personas, no astroturfing, automated accounts labeled as automated, every claim backed by the data.
