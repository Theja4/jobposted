# ENGINE_OUTREACH — the $2,000 affiliate & backlink machine

*Companion to [engine.md](engine.md). Saved 2026-07-04. Constraint set: faceless, no ads, small budget OK (≤$150 core / ≤$500 with optional boosters). Marketing = affiliate commissions, listicle placements, newsletter classifieds, micro-creators, journalist backlinks, directories.*

**Read this first:** placements and affiliates are a *compounding* layer — they keep paying after July — but they are slower cash than the two engines in engine.md. The honest month-1 mix that reaches $2,000:

| Source | Mechanism | Month-1 cash (base case) |
|---|---|---|
| Launch service (engine.md Track 1) | audit-led cold email, $199/client | $800–1,400 (4–7 clients) |
| Lifetime deal (Track 2) | AppSumo Marketplace (95% rev on your-link sales) + DealMirror/DealFuel | $600–1,200 (12–25 × $59) |
| Subscriptions via placements/affiliates (this doc) | $19.99/mo / $39.99/q through listicles, newsletters, creators | $150–500 month 1, growing monthly |
| **Total** | | **$1,550–3,100** |

Bear case ≈ $1,100 (raise service price, push follow-ups). Bull case ≈ $3,500+ (one creator video converts). The affiliate layer is also what makes August–September passive: every placement won in July keeps sending traffic.

---

## 0. Day-0 infrastructure (one day, do in this order)

### 0.1 Turn on the Creem affiliate program (~1 hour, $0)
Billing already runs on Creem — and **Creem has a native affiliate program** (Hub for you: create program, set commissions, invite partners; Portal for affiliates: referral link + earnings; tracking, attribution, and payouts are automatic, paid on the 1st and 15th, affiliate does their own KYC). No Rewardful, no PartnerStack, no extra monthly fee. Docs: https://docs.creem.io + the setup walkthroughs on dev.to ("How to Set Up an Affiliate Program with Creem").

**Program settings (make it the richest program in the niche — that's the pitch):**
- Commission: **40% recurring on all payments in the first 12 months** ($19.99/mo → ~$8/mo per referred sub; $39.99/q → ~$16/q).
- Cookie window: 60 days (job seekers browse before buying).
- Minimum payout: lowest Creem allows.
- Also issue each partner a **promo code** (10–15% off) so untracked mentions (podcasts, TikTok verbal) still attribute.

Comparison ammo for outreach: most job-tool programs pay 20–30% one-time. 40% × 12 months is a genuinely better deal — say so explicitly in every pitch.

### 0.2 `/partners` page + assets kit (~2 hours)
One page on jobposted.com: what JobPosted does (30s demo video), commission terms, "join in 2 minutes" → Creem affiliate portal link, and a Google Drive assets folder:
- 3 speedrun GIFs (Workday fill, Greenhouse fill, split-screen race)
- 30s vertical MP4 + 30s horizontal MP4
- 5 clean screenshots, logo pack, 3 ready-to-paste copy blocks (50/100/200 words)
- **FTC disclosure snippet they must use** ("#ad / affiliate link — I earn a commission"). Non-negotiable; protects you and them.

### 0.3 Outreach mailbox (~1 hour, ~$10–17)
- Buy a sister domain (e.g. `getjobposted.com` or `jobpostedhq.com`, ~$10) so cold sends never touch jobposted.com deliverability.
- Mailbox: Zoho Mail free tier or Google Workspace ($7/mo). Set SPF, DKIM, DMARC on day one.
- Warm it 3–4 days (a few sends to your own accounts, normal replies), then cap at **≤25 sends/day, plain text, no images, 1:1 tone**.
- Sender identity: your real first name + "Partnerships, JobPosted." Faceless = no photo, no personal brand. It does NOT mean a fake persona — never invent a person.

### 0.4 CRM sheet (~30 min)
One Google Sheet, columns: `Name · Outlet/handle · Tier (listicle/newsletter/creator/journalist/directory) · Audience size · Contact route · Email (verified? Y/N) · Angle · Sent date · Follow-up 1 · Follow-up 2 · Reply · Status · Deal terms · Live link`. Every send gets logged. (This is also the sheet a Hermes cell reads/writes later — GROWTH_AUTOMATION.md §2.9.)

### 0.5 Email-finding + verification stack ($0–34)
1. **Check their site first** — coaches and bloggers publish emails on /contact or /about (most of the Tier-3 list below has one).
2. Hunter.io free (25 searches/mo) → Snov.io free (50 credits) → Anymail Finder (pay-per-found) for the rest.
3. Journalists: **Muck Rack public profiles** (muckrack.com — search the beat), outlet patterns below, X/LinkedIn DMs.
4. **Verify every address** before sending (MillionVerifier/NeverBounce free tiers). Bounces >3% poison the new domain. **Never send to a guessed address** — if you can't verify, use the site's contact form or a DM instead.

Known outlet patterns (verify each before use): WSJ `first.last@wsj.com` · CNBC `first.last@nbcuni.com` · Fortune `first.last@fortune.com` · Business Insider `finitiallast@businessinsider.com`.

---

## 1. The four-tier target map (who gets which offer)

| Tier | Who | What you offer | Realistic yield in 30 days |
|---|---|---|---|
| 1. Mid-tier listicles & "alternatives" pages | career blogs, staffing-firm blogs, tool-comparison posts that already rank | free Pro account + 40%×12mo affiliate + pre-written blurb | 3–8 placements live |
| 2. Newsletters | job-search / layoff / remote-work newsletters | $50–150 classified OR affiliate link, their choice | 2–4 mentions |
| 3. Micro-creators (TikTok/YT) | careertok coaches & recruiters 20–350K | affiliate + promo code first; flat $50–150 only for proven formats | 3–6 videos |
| 4. Journalists & big pubs | ghost-jobs beat + careers desks | the data study (GROWTH_PLAYBOOK §5), not the product | 1–3 backlinks/citations |

Rule: **affiliate-first, flat-fee second.** A 40%-recurring offer costs you $0 up front and filters for partners who actually believe they can convert.

---

## 2. Tier 1 — listicle & "alternatives" placements (start day 2)

The searches your buyers actually make: "LazyApply alternatives", "Simplify alternatives", "auto apply AI", "best AI job search tools", "AIHawk alternative" (AIHawk archived May 2026 — orphaned users, nobody owns that query yet). Two plays: **get added to existing ranked pages** (this section) and **own your own pages** (§2.4).

### 2.1 Non-competitor career/staffing blogs (best odds — they monetize via affiliate, you're free inventory)

| Target | Page that matters | Person | Contact route | Pitch angle |
|---|---|---|---|---|
| **The Interview Guys** (blog.theinterviewguys.com) | "Ghost Jobs Exposed" + tool roundups | Mike Simpson (co-founder, w/ Jeff Gillis) | site contact form; email on media/about page | copilot-not-autopilot tool for their readers + 40% affiliate; later: ghost-jobs dataset (§5) |
| **Career Sherpa** (careersherpa.net) | weekly "Summary Sunday" + tools posts | Hannah Morgan | contact page (publishes email) | she curates tools weekly; offer demo access + affiliate |
| **Career Sidekick** (careersidekick.com) | AI job-search tool lists | owned by Amai Group (founder Biron Clark) | contact/advertise page | they run display + affiliate; paid listing or affiliate add |
| **Work It Daily** (workitdaily.com) | tool recommendations, 1.5M monthly visitors | J.T. O'Donnell (CEO) | site contact; she's very active on LinkedIn/TikTok (@j.t.odonnell) | affiliate + her audience is exactly job seekers; she also does tool features on YouTube |
| **Apollo Technical** (apollotechnical.com) | "Best AI Job Search Tools: What Actually Works" | marketing team (staffing firm) | contact page; they accept contributed content | ask to be added to the existing post + affiliate |
| **Frontline Source Group** (frontlinesourcegroup.com) | "2026 job search tools" post | marketing team | contact form | same add-me pitch |
| **Welcome to the Jungle** (welcometothejungle.com) | careers media, wrote the careertok roundup | editorial (staff writers on masthead) | editorial contact / pitch email on site | story pitch, not affiliate: "the anti-spray-apply tool" or ghost-jobs data |
| **Metaintro** (metaintro.com) | blog covered ghost jobs; newsletter 3×/wk, claims 700K users | growth/partnerships | site contact | newsletter placement (§3) + blog listicle add |

### 2.2 Tool-run "alternatives" pages that still list rivals (one email each, low effort)
These are tools themselves, but their SEO posts list competitors — being in the consideration set is the point. Offer a reciprocal mention on your own comparison pages (§2.4) or affiliate:
- **Sprad** (sprad.io — employee-referral SaaS, not a competitor): "Top 5 LazyApply Alternatives" + "Top 5 Simplify Alternatives"
- **Oaki** (oaki.io): "Best Auto-Apply Tools 2026: 8 AI Job Application Bots"
- **LiftMyCV** (liftmycv.com): "7 Best LazyApply Alternatives (2026)"
- **jobstrack.io** (job tracker): ghost-jobs + tools posts
- **jobhire.ai**: "8 Best Automatic Job Application Tools In 2026"

Skip as direct competitors (their lists will never include you): Teal, Jobscan, Zety, Enhancv, BeamJobs, FastApply, JobWizard, Seekario, Sorce, JobCopilot, uppl.ai.

### 2.3 Big pubs (1 email each, expect silence, don't chase)
Forbes Vetted "Best Resume Builders" (Forbes Personal Shopper team), Monster career-advice desk, FlexJobs blog, CIO.com. These buy through affiliate networks (Impact/CJ/Skimlinks) and update listicles on a cycle. The realistic play: one short "consider us for your next update" note to the byline on the page + offer a press account. Real shot comes in month 2–3 via the ghost-jobs study (§5) and network membership if traction justifies the fee.

### 2.4 Own the listicle (highest-leverage SEO move, ~2 days of build)
Renting placement is good; owning the page is better. Build on jobposted.com:
- `/vs/lazyapply`, `/vs/simplify`, `/vs/aihawk` comparison pages (honest feature tables; copilot-not-autopilot is the differentiator). The repo already has the `seo-competitor-pages` skill to generate these properly.
- `/alternatives/aihawk` — "AIHawk is archived. Here's the hosted successor." Nobody owns this query; its users are actively searching.
- One genuinely useful ranked post: "Auto-apply tools compared on 6 portals (July 2026, with screenshots)" — publish on the blog AND a disclosed version on **dev.to** and **Medium** under the JobPosted byline (allowed with disclosure; dev.to listicles rank for these queries — half the results in this niche are dev.to posts).

---

## 3. Tier 2 — newsletters (cheap, fast, exactly your buyer)

Pricing rule of thumb for niche newsletters: $20–50 CPM. A 10K-sub job-search newsletter classified should cost $50–150. Offer affiliate (40%×12mo) as the $0 alternative; many small writers prefer recurring commission over one-off fees.

| Newsletter | Who | Size / notes | Contact route |
|---|---|---|---|
| **Remotive** (remotive.com) | Rodolphe Dutel (founder) | 350K+ readers, remote-work; has a formal newsletter-sponsorship product (see support.remotive.com "Newsletter Sponsorship") | sponsorship page / site contact |
| **Laid Off** (laid0ff.substack.com) | Melanie Ehrenkranz (ex-Gizmodo/Mic journalist) | weekly interview series + 800-member Discord; the single most on-brand audience that exists | Substack DM / reply-to-newsletter; no public rate card — ask. She's also a journalist: offer the ghost-jobs study too |
| **The Job Hopper** (thejobhopper.substack.com) | see About page byline | layoff-survival content | Substack DM / reply |
| **Metaintro** (metaintro.com/newsletter) | growth team | 3×/week, AI+web3 jobs, claims 700K users | site contact — ask for classified rates |
| **The AI Labor Report** (futureforwarded.substack.com) | see About | AI × labor-market analysis | Substack DM |
| **Paved marketplace** (paved.com/jobs-newsletters) | — | **the shortcut**: a browsable directory of job-niche newsletters with audited sizes and listed sponsorship rates — pick 5 in the $50–150 band | self-serve |
| Discord/Slack career servers (bootcamp alumni, H1B/international-student groups) | server owners | highest-volume appliers anywhere | owner DM; offer server-exclusive promo code + affiliate to the owner |

Budget: 2–3 paid classifieds ($150–300 total) only in newsletters whose audience is unambiguously active job seekers. Everything else affiliate.

---

## 4. Tier 3 — micro-creators (TikTok/YouTube, faceless-compatible)

Your ask: they screen-record themselves using JobPosted on a real application (their face optional — the *product* is the visual), promo code + affiliate link in bio/pinned comment. Offer ladder: (1) affiliate 40%×12mo + free Pro + promo code for their audience → (2) flat $50–150 **only after** they reply and only if their content style fits the speedrun format. FTC disclosure required.

Shortlist (real names; sites have contact emails — verify before sending; full 90-name list at creators.feedspot.com/career_tiktok_influencers/):

| Creator | Handle / followers | Why them | Contact |
|---|---|---|---|
| Chloe Spillane | @careercoachchloe · 23K | explicitly covers **AI career tools** — cheapest, best fit, likely responsive | cspillaneconsulting.com |
| Mike Peditto | @realisticrecruiting · 185K | the "honest recruiter" of careertok; one approving video = durable credibility (he will only say what he thinks — that's the value) | realisticrecruiting.net |
| Farah Sharghi | @farahsharghi · 165K + YouTube | ex-recruiter (Google, TikTok, Lyft); reviews job-search tools | farahsharghi.com |
| Bryan Creely | @alifeafterlayoff · 76K TT / ~500K YT | YouTube tool reviews in this niche do big search numbers | alifeafterlayoff.com |
| Hanna Goefft | @hannagetshired · 329K | job-search strategy content, brand-deal experienced | hannagetshired.com |
| Darci Smith | @careercoachdarci · 290K | resume/interview coach, featured in WTTJ's careertok roundup | roklyn.com |
| Sam DeMase | @apowermood · 293K | career empowerment, big engagement | socialxtalent.com (mgmt) |
| Em Rezkalla | @emrezkalla · 222K | corporate career advice | email on profile/site |
| Rob Cancilla | @rob_cancilla · 203K | job-acquisition content | email on profile |
| Anna Belyaeva | @thecareerdiet · 100K | six-figure-role coaching; in WTTJ roundup | thacareerdiet.com |
| Tammie Ballis | @careercoachtammie · 81K (AU) | recruiter, tool-friendly, smaller = cheaper | realisticcareers.com.au |
| Eliana Goldstein | @eliana_goldstein · 66K | job-search strategies | elianagoldsteincoaching.com |
| Greg Langstaff | @greglangstaff · 792K | resume coach — big; affiliate-only offer, he can say no | greglangstaff.com |
| Tessa White | @jobdoctortessa · 779K | "The Job Doctor" — big; affiliate-only offer | shetalentteam.com |
| Sho Dewan | @workhap · 648K | huge careertok brand; affiliate-only offer | workhap.com |

Notes: skip Wonsulting (they sell their own AI tools — conflict). Skip Erin McGoff for now (3M+, agency-priced). **Career coaches double as affiliates** — they recommend tools to paying clients weekly; the coaching-client channel converts far better than a viral video and costs nothing.

---

## 5. Tier 4 — journalists & news (backlinks + authority; pitch the DATA, never the product)

Precondition: publish the **ghost-jobs data study** (GROWTH_PLAYBOOK.md §5 — you have 51 boards ingested daily; "We tracked N postings: X% show ghost-job signatures"). A tool pitch gets deleted; a dataset gets cited. Company byline ("the JobPosted research team") is standard — no face needed.

| Person / desk | Outlet & why | Contact route |
|---|---|---|
| **Te-Ping Chen** | WSJ workplace reporter — wrote the canonical WSJ ghost-jobs piece ("one in five online listings may be ghosts") | muckrack.com/te-ping-chen · te-pingchen.com (contact page) · WSJ pattern `first.last@wsj.com` (verify) |
| CNBC jobs/economy desk | ran "'Ghost job' postings add another layer of uncertainty" (Nov 11 2025, cnbc.com) — check the byline on that article and email that reporter; CNBC Make It careers writers (e.g. Gili Malinsky, Ashton Jackson — verify current bylines) cover job-search tools/behavior | bylined email in article footer or Muck Rack; `first.last@nbcuni.com` (verify) |
| **Grzegorz Kubera** | CIO.com, "Beware the rise of ghost jobs" (June 2026) | Muck Rack profile / CIO author page |
| **Melanie Ehrenkranz** | Laid Off — journalist + perfect audience; data study = a story for her, placement for you | Substack DM |
| **Mike Simpson** | The Interview Guys "Ghost Jobs Exposed" — cites third-party stats; offer the dataset → backlink from a high-traffic post | site contact |
| Muck Rack search "ghost jobs" | the living list of everyone on this beat (Fortune, BI, HR Dive, Newsweek have all covered it) | free search at muckrack.com |
| Wikipedia "Ghost job" article | cites studies (Greenhouse, Clarify Capital…) — once your study is live, suggest it **on the article's Talk page** (declare COI; never edit it in yourself) | wikipedia.org/wiki/Ghost_job → Talk |
| HARO successors | Qwoted (free tier), Featured.com, SourceBottle, Help a B2B Writer — answer journalist requests on jobs/hiring/AI as "founder, JobPosted"; 15 min/day = steady trickle of quoted backlinks | sign up day 1; company byline is fine |

Pitch = GROWTH_PLAYBOOK Appendix C. One pickup = a DR-90 backlink + a "featured in" logo for the landing page + credibility for every Tier-1/2/3 pitch that follows.

---

## 6. Directories & free backlinks (one afternoon, ~$0)

| Directory | Action | Cost |
|---|---|---|
| **AlternativeTo** | create listing; set as alternative to LazyApply, Simplify, Teal, **AIHawk** (orphaned users search here) | free |
| SaaSHub | listing + alternatives positioning | free |
| **AppSumo Marketplace** | doubles as a listing/backlink even before LTD sales | free to list |
| There's An AI For That | /get-featured (paid — check price) or the **free monthly indie-makers thread on X** | $0–paid |
| Futurepedia, Toolify, aitoolsdirectory.com, DropYourAI | submit | mostly free |
| G2 + Capterra | claim free profiles (needed later for review-proof anyway) | free |
| BetaList | if positioning allows "recently launched" | free |
| GitHub awesome-lists | PR to `awesome-job-search`-type lists (that's their purpose; not spam) | free |
| Chrome Web Store SEO | already covered in GROWTH_PLAYBOOK §2.3 — title keywords "Workday, Greenhouse autofill" | free |
| **AIHawk community** | repo archived May 2026; its Discord/Telegram users are orphaned. Join, disclose who you are, be helpful, mention the hosted successor **once** where rules allow. No spam. | free |

The `/alternatives/aihawk` page (§2.4) + AlternativeTo listing + one disclosed community mention = the full AIHawk-orphan play.

---

## 7. Lifetime-deal execution (the month-1 cash anchor from Track 2)

1. **AppSumo Marketplace** (self-serve, sell.appsumo.com): ~1 week to live. Economics confirmed: **95% of revenue on new buyers who come through YOUR links, 70% on existing AppSumo customers**, $0 listing fee. Price the LTD $59–69 ("Founder's lifetime — first 300"), map to the current plan's 20 fills/day. Assets: listing copy, 5 images, 30s video (reuse partner kit), 10 honest seed reviews from real users.
2. **DealMirror**: submit at dealmirror.com/product-deal-request/ (fast approval per engine.md; they negotiate their cut on a call).
3. **DealFuel**: "Submit Deal" vendor form at dealfuel.com.
4. **The multiplier:** the LTD-blog ecosystem (bestlifetimedeals.com, saaspirate.com, rebellink.com, r/lifetimedeals, LTD Facebook groups) promotes marketplace deals *for affiliate commission automatically* — email each blog when the deal goes live ("your readers get X, here's your marketplace affiliate route + our 40% program for the subscription"). This is free distribution that recruits itself, and exactly the "any resume list, anything" channel you asked for.

Since your AppSumo links pay 95%, every Tier-2/3 partner can also push the LTD: give affiliates both links (LTD for instant cash, subscription for recurring).

---

## 8. Templates (send as-is, personalize line 1)

**T1 — listicle add (author of an existing ranked page)**
> Subject: addition for your [LazyApply alternatives] post
>
> Hi {first name} — your [post title] currently ranks for "{query}" and it's one of the fairer writeups out there (most of these lists are written by the tools themselves).
>
> We make JobPosted — a Chrome extension that fills Workday/Greenhouse/etc. applications in ~30 seconds but **never auto-submits** (the user always reviews and clicks submit — the opposite of the spray-apply tools your commenters complain about).
>
> If it earns a spot on the list: our affiliate program pays **40% recurring for 12 months** (most tools in this niche pay 20–30% once), tracked automatically, paid twice monthly. I'll set you up with a free Pro account and a pre-written blurb + screenshots so the update takes 10 minutes.
>
> Worth a look? 60-second demo: {link}
> {first name}, Partnerships — JobPosted

**T2 — follow-up (day 4)**
> Quick nudge on this — happy to send the affiliate terms + demo account without any commitment. If it's a paid-placement-only list, tell me your rate and I'll consider it.

**T3 — break-up (day 9)**
> Closing the loop — if the list gets refreshed later this year, the offer stands (40% × 12 months + free Pro). Good luck with the site.

**T4 — newsletter**
> Subject: classified for {newsletter} — job-application autofill
>
> Hi {name} — I read {specific recent issue/line}. We make JobPosted (Chrome extension: fills a full Workday application in ~30s, user always hits submit themselves — free tier included, so it's a giveable rec, not a hard sell).
>
> Two options, your pick: a paid classified at your normal rate, or an affiliate link at 40% recurring × 12 months if you'd rather only recommend what earns on performance. Demo: {link}

**T5 — creator (email or DM; DM version = first 2 sentences)**
> Hi {name} — your video on {specific real video} was dead-on about {specific point}. We built a Chrome extension that fills job applications in ~30 seconds and then *stops* — it never applies behind your back (your audience rightfully roasts the tools that do).
>
> Want a promo code for your followers + 40% recurring commission for 12 months on anyone who subscribes? Free Pro for you, no script — record yourself using it on a real application and say exactly what you think. Here's the format that performs: {speedrun link}.

**T6 — journalist (after the study is live; also GROWTH_PLAYBOOK App. C)**
> Subject: Data: we tracked {N} job postings — {X}% show ghost-job signatures
>
> Hi {name} — you covered ghost jobs in {piece}. Most stats in this space are small surveys, so we published something different: {N} postings across 51 boards, snapshotted daily since {date}. Findings: {2 stats}. Full methodology + charts: {link}. Happy to share the underlying dataset or run a custom cut (by industry/state) — no strings.
> — The JobPosted research team

**T7 — LTD blog (once marketplace deal is live)**
> Subject: new LTD for your readers — AI job-application autofill ($59 lifetime)
>
> Hi — JobPosted just went live on {AppSumo/DealMirror}: Chrome extension that autofills Workday/Greenhouse applications, $59 lifetime (normally $19.99/mo). Your marketplace affiliate link earns on it as usual, and we additionally pay 40% × 12 months on subscription upgrades via our own program: {link}. Assets folder: {link}.

---

## 9. 30-day calendar (this doc + engine.md merged)

| Days | Actions |
|---|---|
| **1–2** | §0 infra: Creem affiliate program live, /partners page, sister-domain mailbox warming, CRM sheet, email-verify accounts. Submit LTD to AppSumo Marketplace + DealMirror + DealFuel. Directory blitz (§6). Sign up Qwoted/Featured/SourceBottle. |
| **3–5** | Build §2.4 pages (`/vs/*`, `/alternatives/aihawk`, the ranked comparison post). Verify emails for all Tier-1 targets + first 10 creators. Start engine.md Track-1 builds (scraper + audit gen) in parallel — that's the service cash engine. |
| **6–10** | Send Tier-1 (≤10/day): §2.1 blogs first, then §2.2. Send 5 newsletter pitches (§3) incl. Paved picks. First 10 creator emails/DMs (start with Chloe Spillane, Peditto, Sharghi, Creely, Ballis, Goldstein). Service outreach begins per engine.md (15–20 audited emails/day — separate mailbox stream). |
| **11–14** | Follow-ups (T2). LTD likely live → email LTD blogs (T7) + give all affiliates both links. Close first creator deals; ship them promo codes + kit. **Day-14 gate:** <3 placements agreed → raise the offer (45–50% commission) and add 10 more mid-tier targets from the SERPs for "{competitor} alternatives". |
| **15–20** | Ghost-jobs study: queries, write-up, charts (2–3 days). Publish → §5 journalist blast (10–15 verified names via Muck Rack) + r/dataisbeautiful + HN + Wikipedia Talk-page suggestion + hand the story to Laid Off/Metaintro/Interview Guys. |
| **21–27** | Product Hunt launch (Tuesday, per GROWTH_PLAYBOOK §6) — every live affiliate/creator gets a "we're live" nudge (free second touch). Break-up emails (T3). Second creator batch if first converted. |
| **28–30** | Reconcile: Creem affiliate dashboard + LTD payouts + service invoices vs. $2,000. Pay any manual promo-code commissions. Write down which tier produced — August doubles down there. |

Daily ops load: ~60–90 min (sends + follow-ups + reply handling + Qwoted requests). Everything template-driven; later automatable via the Hermes cell (GROWTH_AUTOMATION §2.9) with the same guardrails: verified emails only, real-personalization only, human approves every send.

---

## 10. Budget

| Item | Cost |
|---|---|
| Sister domain + mailbox | $10 + $0–7/mo |
| Email verification credits | $0–15 |
| Hunter/Snov paid tier (only if free credits run out) | $0–34 |
| Newsletter classifieds (2–3) | $100–300 (optional) |
| Creator flat fees (only post-reply, proven format) | $100–300 (optional) |
| TAAFT featured listing | optional, check current price |
| **Core total / with boosters** | **~$40 / ≤$650** |

## 11. Hard rules (the offer stays clean — same spirit as engine.md)

1. No fabricated sender identity; company byline is fine, fake humans are not.
2. Verified emails only; ≤25 cold sends/day/mailbox; honor every opt-out instantly; no purchased lists.
3. Every affiliate/creator must disclose (FTC) — it's in the kit; enforce it.
4. Personalization must reference something real (their actual post/video). One hallucinated compliment burns the brand.
5. No Wikipedia self-edits (Talk page only, COI declared). No Reddit astroturfing. No fake reviews anywhere.
6. No "guaranteed indexing/ranking" claims in any pitch (see engine.md guardrails).
7. Journalists get data, never a product pitch.
